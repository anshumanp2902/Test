package com.example.demortc;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.ComponentScan;

@SpringBootApplication
@ComponentScan("com.example")
public class DemortcApplication {

    public static void main(String[] args) {
        SpringApplication.run(DemortcApplication.class, args);
    }

}
