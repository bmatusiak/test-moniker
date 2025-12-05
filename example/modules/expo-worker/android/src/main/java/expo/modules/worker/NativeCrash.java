package expo.modules.worker;

public class NativeCrash {
  static {
    try {
      System.loadLibrary("expo_worker_crash");
    } catch (Throwable t) {
      // best-effort: library may not be available on all build environments
    }
  }

  public static native void triggerCrash();
}
