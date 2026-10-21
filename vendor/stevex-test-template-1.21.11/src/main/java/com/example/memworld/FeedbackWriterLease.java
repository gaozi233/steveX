package com.example.memworld;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;

/** The writer JVM, not its launcher, owns the OS lease until shutdown. */
public final class FeedbackWriterLease implements AutoCloseable {
    private final FileChannel channel;
    private final FileLock lock;

    public FeedbackWriterLease(Path file) throws IOException {
        channel = FileChannel.open(file, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        try {
            lock = channel.tryLock();
            if (lock == null) throw new IOException("Another feedback writer owns this agent");
        } catch (IOException | OverlappingFileLockException e) {
            channel.close();
            throw new IOException("Another feedback writer owns this agent", e);
        }
    }

    @Override public void close() throws IOException {
        lock.release();
        channel.close();
    }
}
