package name.modid;

public final class RendererMethodPolicyTest {
    public static void main(String[] args) {
        for (String method : new String[]{"player", "inventory", "key/up", "container/open", "vision/snapshot", "vision/entity", "f3"}) {
            if (RendererMethodPolicy.allows(method, true)) throw new AssertionError("Unsafe renderer method: " + method);
            if (!RendererMethodPolicy.allows(method, false)) throw new AssertionError("Legacy native API lost: " + method);
        }
        for (String method : new String[]{"status", "render/status", "render/bind", "render/capture", "render/unbind"}) {
            if (!RendererMethodPolicy.allows(method, true)) throw new AssertionError("Capture method blocked: " + method);
        }
        System.out.println("Renderer identity boundary checks passed");
    }
}
