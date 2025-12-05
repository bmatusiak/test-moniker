#include <jni.h>
#include <cstdlib>

extern "C" JNIEXPORT void JNICALL
Java_expo_modules_worker_NativeCrash_triggerCrash(JNIEnv* env, jclass clazz) {
    // Intentionally cause a crash (SIGSEGV) by dereferencing a null pointer
    volatile int* p = nullptr;
    *p = 42;
    (void)p;
}
