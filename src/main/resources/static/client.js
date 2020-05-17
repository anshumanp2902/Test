//connecting to our signaling server
const protocol = (window.location.protocol==="http:")?"ws:":"wss:";
const URL = protocol + "//" + window.location.host;
let conn = new WebSocket(URL+"/socket");


// Output logging information to console.

function log(text) {
    const time = new Date();

    if (typeof text == 'Object' || typeof text == 'Array')
        console.log("[" + time.toLocaleTimeString() + "] " + JSON.stringify(text));
    else
        console.log("[" + time.toLocaleTimeString() + "] " + text);
}

// Output an error message to console.

function log_error(text) {
    const time = new Date();

    if (typeof text === 'Object')
        console.log("Error - [" + time.toLocaleTimeString() + "] " + JSON.stringify(text));
    else
        console.log("Error - [" + time.toLocaleTimeString() + "] " + text);
}

const mediaConstraints = {
    audio: true,            // We want an audio track
    video: {
        aspectRatio: {
            ideal: 1.333333     // 3:2 aspect is preferred
        }
    }
};

conn.onopen = function() {
    log("Connected to the signaling server");
};

conn.onmessage = function(msg) {
    log("Got message" + msg.data);
    const content = JSON.parse(msg.data);
    log(content);
    switch (content.type) {

        case "video-offer":  // Invitation and offer to chat
            handleVideoOfferMsg(msg);
            break;

        case "video-answer":  // Callee has answered our offer
            handleVideoAnswerMsg(msg);
            break;

        case "new-ice-candidate": // A new ICE candidate has been received
            handleNewICECandidateMsg(msg);
            break;

        case "hang-up": // The other peer has hung up the call
            handleHangUpMsg(msg);
            break;

        // Unknown message; output to console for debugging.

        default:
            log_error("Unknown message received:");
            log_error(msg);
            break;
    }
};

function sendToServer(message) {
    log("Websocket readyState - "+conn.readyState);
    conn.send(JSON.stringify(message));
}


let webCamStream = null;
let myPeerConnection = null;
let transceiver = null;         // RTCRtpTransceiver

async function createPeerConnection() {

    log("Setting up a connection...");

    // Create an RTCPeerConnection which knows to use our chosen
    // STUN server.

    myPeerConnection = new RTCPeerConnection({
        iceServers: [
            {urls:"stun:stun.stunprotocol.org:3478"}
            // ,
            // {urls:"stun:stun.l.google.com:19302"},
            // {urls:"stun:stun1.l.google.com:19302"},
            // {urls:"stun:stun2.l.google.com:19302"},
            // {urls:"stun:stun3.l.google.com:19302"},
            // {urls:"stun:stun4.l.google.com:19302"},
            // {urls:"stun:stun01.sipphone.com"},
            // {urls:"stun:stun.ekiga.net"},
            // {urls:"stun:stun.fwdnet.net"},
            // {urls:"stun:stun.ideasip.com"},
            // {urls:"stun:stun.iptel.org"},
            // {urls:"stun:stun.rixtelecom.se"},
            // {urls:"stun:stun.schlund.de"},
            // {urls:"stun:stunserver.org"},
            // {urls:"stun:stun.softjoys.com"},
            // {urls:"stun:stun.voiparound.com"},
            // {urls:"stun:stun.voipbuster.com"},
            // {urls:"stun:stun.voipstunt.com"},
            // {urls:"stun:stun.voxgratia.org"},
            // {urls:"stun:stun.xten.com"}
            ]
    });

    // Set up event handlers for the ICE negotiation process.
    myPeerConnection.onicecandidate = handleICECandidateEvent;
    myPeerConnection.oniceconnectionstatechange = handleICEConnectionStateChangeEvent;
    myPeerConnection.onicegatheringstatechange = handleICEGatheringStateChangeEvent;
    myPeerConnection.onsignalingstatechange = handleSignalingStateChangeEvent;
    myPeerConnection.onnegotiationneeded = handleNegotiationNeededEvent;
    myPeerConnection.ontrack = handleTrackEvent;

}

// Handles |icecandidate| events by forwarding the specified
// ICE candidate (created by our local ICE agent) to the other
// peer through the signaling server.
function handleICECandidateEvent(event) {
    if (event.candidate) {

        log("*** Outgoing ICE candidate: " + event.candidate.candidate);
        sendToServer({
            type: "new-ice-candidate",
            candidate: event.candidate
        });
    }

}

// Handle |iceconnectionstatechange| events. This will detect
// when the ICE connection is closed, failed, or disconnected.
//
// This is called when the state of the ICE agent changes.
function handleICEConnectionStateChangeEvent(event) {

    log("*** ICE connection state changed to " + myPeerConnection.iceConnectionState);
    switch(myPeerConnection.iceConnectionState) {
        case "closed":
        case "failed":
        case "disconnected":
            closeVideoCall();
            break;
    }

}

// Handle the |icegatheringstatechange| event. This lets us know what the
// ICE engine is currently working on: "new" means no networking has happened
// yet, "gathering" means the ICE engine is currently gathering candidates,
// and "complete" means gathering is complete. Note that the engine can
// alternate between "gathering" and "complete" repeatedly as needs and
// circumstances change.
//
// We don't need to do anything when this happens, but we log it to the
// console so you can see what's going on when playing with the sample.
function handleICEGatheringStateChangeEvent(event) {
    log("*** ICE gathering state changed to: " + myPeerConnection.iceGatheringState);

}

// Set up a |signalingstatechange| event handler. This will detect when
// the signaling connection is closed.
//
// NOTE: This will actually move to the new RTCPeerConnectionState enum
// returned in the property RTCPeerConnection.connectionState when
// browsers catch up with the latest version of the specification!
function handleSignalingStateChangeEvent(event) {
    log("*** WebRTC signaling state changed to: " + myPeerConnection.signalingState);
    if (myPeerConnection.signalingState === "closed") {
        closeVideoCall();
    }

}

// Called by the WebRTC layer to let us know when it's time to
// begin, resume, or restart ICE negotiation.
async function handleNegotiationNeededEvent() {

    log("*** Negotiation needed");
    try {
        log("---> Creating offer");

        const offer = await myPeerConnection.createOffer();

        // If the connection hasn't yet achieved the "stable" state,
        // return to the caller. Another negotiationneeded event
        // will be fired when the state stabilizes.
        if (myPeerConnection.signalingState != "stable") {
            log("     -- The connection isn't stable yet; postponing...")
            return;

        }

        // Establish the offer as the local peer's current
        // description.
        log("---> Setting local description to the offer");

        await myPeerConnection.setLocalDescription(offer);

        // Send the offer to the remote peer.
        log("---> Sending the offer to the remote peer");
        sendToServer({
            type: "video-offer",
            sdp: myPeerConnection.localDescription
        });
    } catch(err) {
        log("*** The following error occurred while handling the negotiationneeded event:");
        log_error(err);
    };

}

// Called by the WebRTC layer when events occur on the media tracks
// on our WebRTC call. This includes when streams are added to and
// removed from the call.
//
// track events include the following fields:
//
// RTCRtpReceiver       receiver
// MediaStreamTrack     track
// MediaStream[]        streams
// RTCRtpTransceiver    transceiver
//
// In our case, we're just taking the first stream found and attaching
// it to the <video> element for incoming media.
function handleTrackEvent(event) {
    log("*** Track event");
    log(event);
    document.getElementById("received_video").srcObject = event.streams[0];
    document.getElementById("hangup-button").disabled = false;

}

// Close the RTCPeerConnection and reset variables so that the user can
// make or receive another call if they wish. This is called both
// when the user hangs up, the other user hangs up, or if a connection
// failure is detected.
function closeVideoCall() {

    let localVideo = document.getElementById("local_video");

    log("Closing the call");

    // Close the RTCPeerConnection
    if (myPeerConnection) {
        log("--> Closing the peer connection");

        // Disconnect all our event listeners; we don't want stray events
        // to interfere with the hangup while it's ongoing.

        myPeerConnection.ontrack = null;
        myPeerConnection.onnicecandidate = null;
        myPeerConnection.oniceconnectionstatechange = null;
        myPeerConnection.onsignalingstatechange = null;
        myPeerConnection.onicegatheringstatechange = null;
        myPeerConnection.onnotificationneeded = null;

        // Stop all transceivers on the connection

        myPeerConnection.getTransceivers().forEach(transceiver => {
            console.log(transceiver);
            //transceiver.stop();
        });

        // Stop the webcam preview as well by pausing the <video>
        // element, then stopping each of the getUserMedia() tracks
        // on it.

        if (localVideo.srcObject) {
            localVideo.pause();
            localVideo.srcObject.getTracks().forEach(track => {
                track.stop();
            });
        }

        // Close the peer connection

        myPeerConnection.close();
        myPeerConnection = null;
        webCamStream = null;
    }

    // Disable the hangup button

    document.getElementById("hangup-button").disabled = true;
}

// Handle the "hang-up" message, which is sent if the other peer
// has hung up the call or otherwise disconnected.

function handleHangUpMsg(msg) {
    log("*** Received hang up notification from other peer" + msg);

    closeVideoCall();
}

function hangUpCall() {
    closeVideoCall();

    sendToServer({
        type: "hang-up"
    });
}


// Handle a click on an item in the user list by inviting the clicked
// user to video chat. Note that we don't actually send a message to
// the callee here -- calling RTCPeerConnection.addTrack() issues
// a |notificationneeded| event, so we'll let our handler for that
// make the offer.

async function invite(evt) {
    log("Starting to prepare an invitation");
    if (myPeerConnection) {
        alert("You can't start a call because you already have one open!");
    } else {
        // let clickedUsername = evt.target.textContent;
        //
        // // Don't allow users to call themselves, because weird.
        //
        // if (clickedUsername === myUsername) {
        //     alert("I'm afraid I can't let you talk to yourself. That would be weird.");
        //     return;
        // }
        //
        // // Record the username being called for future reference
        //
        // targetUsername = clickedUsername;
        // log("Inviting user " + targetUsername);

        // Call createPeerConnection() to create the RTCPeerConnection.
        // When this returns, myPeerConnection is our RTCPeerConnection
        // and webcamStream is a stream coming from the camera. They are
        // not linked together in any way yet.

        //log("Setting up connection to invite user: " + targetUsername);
        log("Setting up connection to invite user: ");
        createPeerConnection();

        // Get access to the webcam stream and attach it to the
        // "preview" box (id "local_video").

        try {
            webCamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
            document.getElementById("local_video").srcObject = webCamStream;
        } catch(err) {
            handleGetUserMediaError(err);
            return;
        }

        // Add the tracks from the stream to the RTCPeerConnection

        try {
            webCamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webCamStream]})
            );
        } catch(err) {
            handleGetUserMediaError(err);
        }
    }
}

// Accept an offer to video chat. We configure our local settings,
// create our RTCPeerConnection, get and attach our local camera
// stream, then create and send an answer to the caller.

async function handleVideoOfferMsg(msg) {

    // If we're not already connected, create an RTCPeerConnection
    // to be linked to the caller.

    log("Received video chat offer from ");
    if (!myPeerConnection) {
        createPeerConnection();
    }

    // We need to set the remote description to the received SDP offer
    // so that our local WebRTC layer knows how to talk to the caller.
    const offerMessage = JSON.parse(msg.data);
    let desc = new RTCSessionDescription(offerMessage.sdp);

    // If the connection isn't stable yet, wait for it...

    if (myPeerConnection.signalingState != "stable") {
        log("  - But the signaling state isn't stable, so triggering rollback");

        // Set the local and remove descriptions for rollback; don't proceed
        // until both return.
        await Promise.all([
            myPeerConnection.setLocalDescription({type: "rollback"}),
            myPeerConnection.setRemoteDescription(desc)
        ]);
        return;
    } else {
        log ("  - Setting remote description");
        await myPeerConnection.setRemoteDescription(desc);
    }

    // Get the webcam stream if we don't already have it

    if (!webCamStream) {
        try {
            webCamStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);
        } catch(err) {
            handleGetUserMediaError(err);
            return;
        }

        document.getElementById("local_video").srcObject = webCamStream;

        // Add the camera stream to the RTCPeerConnection

        try {
            webCamStream.getTracks().forEach(
                transceiver = track => myPeerConnection.addTransceiver(track, {streams: [webCamStream]})
            );
        } catch(err) {
            handleGetUserMediaError(err);
        }
    }

    log("---> Creating and sending answer to caller");

    await myPeerConnection.setLocalDescription(await myPeerConnection.createAnswer());

    sendToServer({
        type: "video-answer",
        sdp: myPeerConnection.localDescription
    });
}

// Responds to the "video-answer" message sent to the caller
// once the callee has decided to accept our request to talk.

async function handleVideoAnswerMsg(msg) {
    log("*** Call recipient has accepted our call");

    // Configure the remote description, which is the SDP payload
    // in our "video-answer" message.
    const answerMsg = JSON.parse(msg.data);
    let desc = new RTCSessionDescription(answerMsg.sdp);
    await myPeerConnection.setRemoteDescription(desc).catch(log_error);
}

// A new ICE candidate has been received from the other peer. Call
// RTCPeerConnection.addIceCandidate() to send it along to the
// local ICE framework.

async function handleNewICECandidateMsg(msg) {
    const newCandidateMsg = JSON.parse(msg.data);
    let candidate = new RTCIceCandidate(newCandidateMsg.candidate);

    log("*** Adding received ICE candidate: " + JSON.stringify(candidate));
    try {
        await myPeerConnection.addIceCandidate(candidate);
    } catch(err) {
        log_error(err);
    }
}

// Handle errors which occur when trying to access the local media
// hardware; that is, exceptions thrown by getUserMedia(). The two most
// likely scenarios are that the user has no camera and/or microphone
// or that they declined to share their equipment when prompted. If
// they simply opted not to share their media, that's not really an
// error, so we won't present a message in that situation.

function handleGetUserMediaError(e) {
    log_error(e);
    switch(e.name) {
        case "NotFoundError":
            alert("Unable to open your call because no camera and/or microphone" +
                "were found.");
            break;
        case "SecurityError":
        case "PermissionDeniedError":
            // Do nothing; this is the same as the user canceling the call.
            break;
        default:
            alert("Error opening your camera and/or microphone: " + e.message);
            break;
    }

    // Make sure we shut down our end of the RTCPeerConnection so we're
    // ready to try again.

    closeVideoCall();
}
