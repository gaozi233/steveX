package com.example.memworld;

import java.io.IOException;
import java.nio.file.Files;

public final class FeedbackWriterLeaseTest {
    public static void main(String[] args) throws Exception {
        var file = Files.createTempFile("stevex-feedback-", ".lock");
        try {
            try (var first = new FeedbackWriterLease(file)) {
                boolean rejected = false;
                try (var second = new FeedbackWriterLease(file)) { }
                catch (IOException expected) { rejected = true; }
                if (!rejected) throw new AssertionError("Concurrent writer was accepted");
            }
            try (var reopened = new FeedbackWriterLease(file)) { }
            System.out.println("Feedback writer lease checks passed");
        } finally { Files.deleteIfExists(file); }
    }
}
