package name.modid.vision;

import java.nio.file.Path;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.io.IOException;
import java.util.Properties;
import java.util.UUID;
import java.util.HashSet;
import java.util.Set;
import net.minecraft.client.Minecraft;

/** Selected on the client thread under CAPTURE_LOCK; stores retain their resolved paths. */
public final class MemoryPaths {
    private static volatile Path selected;
    private static final Set<Path> opened = new HashSet<>();
    private MemoryPaths() {}

    public static Path directory() {
        Path root = selected;
        return root != null ? root : Minecraft.getInstance().gameDirectory.toPath().resolve("stevex/vision");
    }

    public static String identifier(String value) {
        if (value == null || !value.matches("[a-zA-Z0-9_-]{1,80}")) throw new IllegalArgumentException("invalid memory namespace/agentId");
        return value;
    }

    public static void select(String namespace, String agentId, UUID uuid, String server) throws IOException {
        identifier(namespace);
        identifier(agentId);
        Path root = Minecraft.getInstance().gameDirectory.toPath().resolve("stevex/render/agents")
                .resolve(namespace).resolve(agentId).toAbsolutePath().normalize();
        if (!opened.contains(root) && opened.size() >= 32) throw new IOException("renderer supports at most 32 memory contexts per process");
        Files.createDirectories(root);
        Path owner = root.resolve("owner.properties");
        Properties identity = new Properties();
        if (Files.exists(owner)) {
            try (var input = Files.newInputStream(owner)) { identity.load(input); }
            if (!namespace.equals(identity.getProperty("namespace")) || !agentId.equals(identity.getProperty("agentId"))
                    || !uuid.toString().equals(identity.getProperty("uuid")) || !server.equals(identity.getProperty("server"))) {
                throw new IOException("memory identity differs; choose a fresh memoryNamespace rather than reusing this directory");
            }
        } else {
            identity.setProperty("namespace", namespace);
            identity.setProperty("agentId", agentId);
            identity.setProperty("uuid", uuid.toString());
            identity.setProperty("server", server);
            try (var output = Files.newOutputStream(owner, StandardOpenOption.CREATE_NEW)) { identity.store(output, "SteveX render memory owner"); }
        }
        opened.add(root);
        selected = root;
    }

    public static void clearSelection() { selected = null; }
}
