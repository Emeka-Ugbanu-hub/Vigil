#[cfg(target_os = "macos")]
use std::sync::OnceLock;
#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
static OUTSIDE_CLICK_MONITOR: OnceLock<usize> = OnceLock::new();

pub fn activate_app<R: tauri::Runtime>(_app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    unsafe {
        let cls =
            objc2::runtime::AnyClass::get(c"NSApplication").expect("NSApplication class not found");
        let ns_app: *mut objc2::runtime::NSObject = objc2::msg_send![cls, sharedApplication];
        let _: () = objc2::msg_send![ns_app, activateIgnoringOtherApps: true];
    }
}

pub fn install_outside_click_monitor<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    #[cfg(target_os = "macos")]
    {
        if OUTSIDE_CLICK_MONITOR.get().is_some() {
            return;
        }

        let app = app.clone();
        unsafe {
            let cls =
                objc2::runtime::AnyClass::get(c"NSEvent").expect("NSEvent class not found");
            let left_mouse_down = 1u64 << 1;
            let right_mouse_down = 1u64 << 3;
            let other_mouse_down = 1u64 << 25;
            let mask = left_mouse_down | right_mouse_down | other_mouse_down;

            let block =
                block2::RcBlock::new(move |_event: *mut objc2::runtime::NSObject| {
                    if let Some(window) = app.get_webview_window("popover") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        }
                    }
                });

            let monitor: *mut objc2::runtime::NSObject =
                objc2::msg_send![cls, addGlobalMonitorForEventsMatchingMask: mask, handler: &*block];

            let _ = OUTSIDE_CLICK_MONITOR.set(monitor as usize);
            std::mem::forget(block);
        }
    }
}

pub fn configure_overlay_window(_ns_window_ptr: *mut std::ffi::c_void) {
    // Popover uses always_on_top from tauri.conf.json — no custom NSWindow config needed on macOS 15+
}
