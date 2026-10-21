package name.modid;

import java.util.Set;

public final class RendererMethodPolicy {
    private static final Set<String> SHARED_METHODS = Set.of(
            "status", "render/bind", "render/status", "render/capture", "render/unbind");

    private RendererMethodPolicy() {}

    public static boolean allows(String method, boolean sharedRenderer) {
        return !sharedRenderer || SHARED_METHODS.contains(method);
    }
}
