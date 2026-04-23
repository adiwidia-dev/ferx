use rfd::FileDialog;
use std::path::Path;
use tauri::path::BaseDirectory;
use tauri::webview::DownloadEvent;
use tauri::Emitter;
use tauri::Manager;
use tauri::Runtime;
use tauri::Webview;
use url::Url;

/// Wry (and WebKit) already set `destination` to e.g. `~/Downloads/photo_123.jpg` using the
/// response’s suggested filename, which often includes a sensible extension. Prefer that.
fn suggested_name_for_dialog(url: &Url, destination: &Path) -> String {
  if let Some(name) = destination
    .file_name()
    .and_then(|n| n.to_str())
    .map(str::trim)
    .filter(|s| !s.is_empty())
  {
    return sanitize_filename(name);
  }
  filename_from_url_heuristic(url)
}

/// Last resort when the engine did not provide a file name: derive from the request URL only.
/// Many apps (e.g. WhatsApp) use opaque URLs, so this often yields only `"download"`.
fn filename_from_url_heuristic(url: &Url) -> String {
  if let Some(name) = url
    .path_segments()
    .and_then(|mut s| s.next_back())
    .filter(|s| !s.is_empty())
  {
    return sanitize_filename(name);
  }
  for (k, v) in url.query_pairs() {
    if k == "filename" || k == "file" || k == "name" {
      return sanitize_filename(&v);
    }
  }
  "download".to_string()
}

fn sanitize_filename(name: &str) -> String {
  let t = name.trim();
  if t.is_empty() {
    return "download".to_string();
  }
  t.chars()
    .map(|c| {
      if matches!(
        c,
        '/' | '\\' | ':' | '<' | '>' | '|' | '?' | '*' | '"' | '\0'
      ) {
        '_'
      } else {
        c
      }
    })
    .collect()
}

/// Prompts for a save path when a service webview starts a download (e.g. WhatsApp media).
/// Cancelling the dialog aborts the download.
pub fn handle_service_webview_download<R: Runtime>(
  webview: Webview<R>,
  event: DownloadEvent<'_>,
) -> bool {
  match event {
    DownloadEvent::Requested { url, destination } => {
      // `destination` is pre-filled by Wry: Downloads dir + WebKit’s suggested file name
      // (see wry’s `download_policy`), so it usually has the right stem + extension.
      let suggested = suggested_name_for_dialog(&url, destination.as_path());
      let app = webview.app_handle();
      let downloads = app.path().resolve("", BaseDirectory::Download).ok();
      let start_dir = destination
        .parent()
        .map(Path::to_path_buf)
        .or(downloads);

      let window = webview.window();
      let mut dialog = FileDialog::new()
        .set_title("Save file")
        .set_parent(&window);
      if let Some(dir) = start_dir {
        dialog = dialog.set_directory(dir);
      }
      if let Some(picked) = dialog.set_file_name(suggested).save_file() {
        *destination = picked;
        return true;
      }
      false
    }
    DownloadEvent::Finished { success, .. } => {
      if !success {
        let _ = webview
          .app_handle()
          .emit("show-toast", "Download failed.");
      }
      true
    }
    _ => true,
  }
}
