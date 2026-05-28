use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Position, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

fn load_tray_icon<R: Runtime>(_app: &AppHandle<R>) -> tauri::image::Image<'static> {
    // Decode the embedded PNG icon to raw RGBA
    let png_bytes = include_bytes!("../icons/16x16.png");
    if let Ok(img) = image::load_from_memory(png_bytes) {
        let rgba = img.to_rgba8();
        let (w, h) = (rgba.width(), rgba.height());
        tauri::image::Image::new_owned(rgba.into_raw(), w, h)
    } else {
        // Fallback: create a simple black circle with white V
        let size: u32 = 16;
        let mut rgba = Vec::with_capacity((size * size * 4) as usize);
        for _y in 0..size {
            for _x in 0..size {
                // Simple black background
                rgba.push(0);
                rgba.push(0);
                rgba.push(0);
                rgba.push(255);
            }
        }
        tauri::image::Image::new_owned(rgba, size, size)
    }
}

pub struct TrayState {
    pub badge_count: Mutex<i64>,
    pub has_critical: Mutex<bool>,
}

const POPOVER_WIDTH: f64 = 300.0;
const POPOVER_HEIGHT: f64 = 360.0;
const POPOVER_MARGIN: f64 = 8.0;

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Vigil", true, None::<&str>)?;
    let badge = MenuItem::with_id(app, "badge", "", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &badge, &quit])?;

    badge.set_text("No items").ok();

    let tray = TrayIconBuilder::new()
        .icon(load_tray_icon(app))
        .menu(&menu)
        .tooltip("Vigil")
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => {
                toggle_popover(app, None);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                position,
                ..
            } = event
            {
                let app = tray.app_handle();
                toggle_popover(app, Some((position.x, position.y)));
            }
        })
        .build(app)?;

    let _tray = tray;

    let state = TrayState {
        badge_count: Mutex::new(0),
        has_critical: Mutex::new(false),
    };
    app.manage(state);

    Ok(())
}

fn toggle_popover<R: Runtime>(app: &AppHandle<R>, cursor_pos: Option<(f64, f64)>) {
    if let Some(window) = get_or_create_popover(app) {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
            return;
        }
            let cursor_pos =
                cursor_pos.or_else(|| window.cursor_position().ok().map(|pos| (pos.x, pos.y)));

            if let Some((cx, cy)) = cursor_pos {
                position_popover_near_point(&window, cx, cy);
            } else {
                let saved_x = crate::db::get_setting(app, "popover_x");
                let saved_y = crate::db::get_setting(app, "popover_y");
                if let (Some(x_str), Some(y_str)) = (&saved_x, &saved_y) {
                    if let (Ok(x), Ok(y)) = (x_str.parse::<i32>(), y_str.parse::<i32>()) {
                        let _ = window.set_position(Position::Physical(PhysicalPosition { x, y }));
                    }
                } else if let Ok(Some(monitor)) = window.primary_monitor() {
                    let m = monitor.position();
                    let s = monitor.size();
                    let x = m.x + (s.width as i32) - POPOVER_WIDTH as i32 - 4;
                    let _ =
                        window.set_position(Position::Physical(PhysicalPosition { x, y: m.y + 4 }));
                }
            }

            crate::activate::activate_app(app);
            let _ = window.show();
            configure_popover(&window);
            let _ = window.set_focus();
    }
}

fn get_or_create_popover<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window("popover") {
        return Some(window);
    }

    match WebviewWindowBuilder::new(
        app,
        "popover",
        WebviewUrl::App("index.html".into()),
    )
    .title("")
    .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible(false)
    .resizable(false)
    .accept_first_mouse(true)
    .build()
    {
        Ok(window) => {
            configure_popover(&window);
            Some(window)
        }
        Err(error) => {
            eprintln!("Failed to create popover window: {error}");
            None
        }
    }
}

fn configure_popover<R: Runtime>(window: &WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    if let Ok(ns_window) = window.ns_window() {
        crate::activate::configure_overlay_window(ns_window);
    }
}

pub fn prewarm_popover<R: Runtime>(app: &AppHandle<R>) {
    if app.get_webview_window("popover").is_some() { return; }
    if let Ok(window) = WebviewWindowBuilder::new(app, "popover", WebviewUrl::App("index.html".into()))
        .title("")
        .inner_size(POPOVER_WIDTH, POPOVER_HEIGHT)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .resizable(false)
        .accept_first_mouse(true)
        .build()
    {
        configure_popover(&window);
    }
}

fn position_popover_near_point<R: Runtime>(window: &WebviewWindow<R>, cx: f64, cy: f64) {
    let monitor = window
        .monitor_from_point(cx, cy)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let area = monitor.work_area();
        let min_x = area.position.x as f64 + POPOVER_MARGIN;
        let min_y = area.position.y as f64 + POPOVER_MARGIN;
        let max_x =
            area.position.x as f64 + area.size.width as f64 - POPOVER_WIDTH - POPOVER_MARGIN;
        let max_y =
            area.position.y as f64 + area.size.height as f64 - POPOVER_HEIGHT - POPOVER_MARGIN;

        let x = clamp(cx - (POPOVER_WIDTH / 2.0), min_x, max_x);
        let below_y = cy + POPOVER_MARGIN;
        let y = if below_y <= max_y {
            below_y
        } else {
            cy - POPOVER_HEIGHT - POPOVER_MARGIN
        };
        let y = clamp(y, min_y, max_y);

        let _ = window.set_position(Position::Physical(PhysicalPosition {
            x: x.round() as i32,
            y: y.round() as i32,
        }));
    } else {
        let x = (cx - (POPOVER_WIDTH / 2.0)).max(0.0);
        let y = cy.max(0.0);
        let _ = window.set_position(Position::Physical(PhysicalPosition {
            x: x.round() as i32,
            y: y.round() as i32,
        }));
    }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if max < min {
        min
    } else {
        value.max(min).min(max)
    }
}

pub fn update_badge<R: Runtime>(app: &AppHandle<R>, urgent_count: i64, total_count: i64) {
    if let Some(state) = app.try_state::<TrayState>() {
        if let Ok(mut badge) = state.badge_count.lock() {
            *badge = total_count;
        }
        if let Ok(mut critical) = state.has_critical.lock() {
            *critical = urgent_count > 0;
        }
    }

}
