package expo.modules.worker

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL

class ExpoWorkerModule : Module() {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('ExpoWorker')` in JavaScript.
    Name("ExpoWorker")

    // Defines constant property on the module.
    Constant("PI") {
      Math.PI
    }

    Function("simulateCrash") {
      try {
        // Throw a Java exception to simulate a crash.
        throw RuntimeException("Simulated Native Java/Kotlin Crash");
      } catch (e: Exception) {
        // rethrow to JavaScript
        throw e
      }
    }


    Function("simulateFatalCrash") {
      try {
        // Attempt to trigger a native C++ crash via the helper. This will intentionally SIGSEGV.
        try {
          NativeCrash.triggerCrash()
        } catch (t: Throwable) {
          // If native library not available or call failed, fall back to a Java exception so tests still exercise crash handling.
          throw RuntimeException("Simulated Native C++ Fatal Crash (fallback)", t)
        }
      } catch (e: Exception) {
        // rethrow to JavaScript
        throw e
      }
    }

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("setValueAsync") { value: String ->
      // Send an event to JavaScript.
      sendEvent("onChange", mapOf(
        "value" to value
      ))
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of
    // the view definition: Prop, Events.
    View(ExpoWorkerView::class) {
      // Defines a setter for the `url` prop.
      Prop("url") { view: ExpoWorkerView, url: URL ->
        view.webView.loadUrl(url.toString())
      }
      // Defines an event that the view can send to JavaScript.
      Events("onLoad")
    }
  }
}
