package com.example.demortc.config;

import lombok.SneakyThrows;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

@Configuration
@EnableWebSocket
public class WebSocketConfiguration implements WebSocketConfigurer {
    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry webSocketHandlerRegistry) {
        webSocketHandlerRegistry.addHandler(new WebSocketHandler() {
            List<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
            @Override
            public void afterConnectionEstablished(WebSocketSession webSocketSession) throws Exception {
                sessions.add(webSocketSession);
            }

            @Override
            public void handleMessage(WebSocketSession session, WebSocketMessage<?> webSocketMessage) throws Exception {
                for (WebSocketSession webSocketSession : sessions) {
                    if (webSocketSession.isOpen() && !session.getId().equals(webSocketSession.getId())) {
                        webSocketSession.sendMessage(webSocketMessage);
                    }
                }
            }

            @Override
            public void handleTransportError(WebSocketSession webSocketSession, Throwable throwable) throws Exception {
                System.err.println("is session open - " +webSocketSession.isOpen());
                throwable.printStackTrace();
            }

            @Override
            public void afterConnectionClosed(WebSocketSession webSocketSession, CloseStatus closeStatus) throws Exception {
                sessions.remove(webSocketSession);
            }

            @Override
            public boolean supportsPartialMessages() {
                return true;
            }
        }, "/socket")
                .setAllowedOrigins("*");
    }
}
