use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use std::path::PathBuf;

const MAX_DROP_FILE_SIZE: u64 = 10 * 1024 * 1024;
const MAX_DROP_FILES: usize = 4;

pub(crate) fn mime_type_from_path(path: &std::path::Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("pdf") => "application/pdf",
        Some("doc") => "application/msword",
        Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        Some("xls") => "application/vnd.ms-excel",
        Some("xlsx") => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        Some("ppt") => "application/vnd.ms-powerpoint",
        Some("pptx") => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        Some("zip") => "application/zip",
        Some("rar") => "application/x-rar-compressed",
        Some("7z") => "application/x-7z-compressed",
        Some("txt") => "text/plain",
        Some("csv") => "text/csv",
        Some("json") => "application/json",
        Some("xml") => "application/xml",
        Some("html" | "htm") => "text/html",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("m4a") => "audio/mp4",
        _ => "application/octet-stream",
    }
}

pub(crate) fn js_escape_filename(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '\'' => out.push_str("\\'"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            _ => out.push(ch),
        }
    }
    out
}

pub(crate) fn build_drag_event_js(event_type: &str) -> String {
    format!(
        concat!(
            "(function(){{",
            "var cx=window.innerWidth/2,cy=window.innerHeight/2,",
            "t=document.elementFromPoint(cx,cy)||document.body,",
            "d=new DataTransfer();",
            "d.items.add(new File([''],'file',{{type:'application/octet-stream'}}));",
            "t.dispatchEvent(new DragEvent('{evt}',",
            "{{dataTransfer:d,bubbles:true,cancelable:true,clientX:cx,clientY:cy}}))}})()"
        ),
        evt = event_type,
    )
}

pub(crate) fn build_file_drop_js(paths: &[PathBuf]) -> Option<String> {
    let mut file_entries = Vec::new();

    for path in paths.iter().take(MAX_DROP_FILES) {
        let metadata = match std::fs::metadata(path) {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if !metadata.is_file() || metadata.len() > MAX_DROP_FILE_SIZE {
            continue;
        }
        let data = match std::fs::read(path) {
            Ok(data) => data,
            Err(_) => continue,
        };
        let filename = match path.file_name().and_then(|name| name.to_str()) {
            Some(filename) => filename,
            None => continue,
        };
        let mime = mime_type_from_path(path);
        let b64 = BASE64.encode(&data);

        file_entries.push(format!(
            "{{n:'{}',t:'{}',d:'{}'}}",
            js_escape_filename(filename),
            mime,
            b64,
        ));
    }

    if file_entries.is_empty() {
        return None;
    }

    let files_js = file_entries.join(",");

    Some(format!(
        r#"(function(){{
var cx=window.innerWidth/2,cy=window.innerHeight/2;
var t=document.elementFromPoint(cx,cy)||document.body;
var fs=[{files}];
var dt=new DataTransfer();
fs.forEach(function(f){{
var b=atob(f.d),u=new Uint8Array(b.length);
for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);
dt.items.add(new File([u],f.n,{{type:f.t,lastModified:Date.now()}}));
}});
var o={{dataTransfer:dt,bubbles:true,cancelable:true,clientX:cx,clientY:cy,screenX:cx,screenY:cy}};
t.dispatchEvent(new DragEvent('dragenter',o));
t.dispatchEvent(new DragEvent('dragover',o));
setTimeout(function(){{
var dropTarget=document.elementFromPoint(cx,cy)||t;
dropTarget.dispatchEvent(new DragEvent('drop',o));
}},100);
}})()"#,
        files = files_js,
    ))
}

pub(crate) fn handle_file_drop(webview: &tauri::Webview, event: &tauri::DragDropEvent) {
    match event {
        tauri::DragDropEvent::Enter { .. } => {
            let _ = webview.eval(build_drag_event_js("dragenter"));
        }
        tauri::DragDropEvent::Over { .. } => {
            let _ = webview.eval(build_drag_event_js("dragover"));
        }
        tauri::DragDropEvent::Drop { paths, .. } => {
            if let Some(js) = build_file_drop_js(paths) {
                let _ = webview.eval(&js);
            }
        }
        tauri::DragDropEvent::Leave => {
            let _ = webview.eval(
                "(function(){document.body.dispatchEvent(new DragEvent('dragleave',{bubbles:true,cancelable:true}))})()",
            );
        }
        _ => {}
    }
}

pub(crate) fn register_file_drop_handler(webview: &tauri::Webview) {
    let cloned = webview.clone();
    webview.on_webview_event(move |event| {
        if let tauri::WebviewEvent::DragDrop(ref drag_drop_event) = *event {
            handle_file_drop(&cloned, drag_drop_event);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::{build_drag_event_js, build_file_drop_js, js_escape_filename, mime_type_from_path};
    use std::path::Path;

    #[test]
    fn mime_type_from_path_detects_common_image_types() {
        assert_eq!(mime_type_from_path(Path::new("photo.png")), "image/png");
        assert_eq!(mime_type_from_path(Path::new("photo.jpg")), "image/jpeg");
        assert_eq!(mime_type_from_path(Path::new("photo.JPEG")), "image/jpeg");
        assert_eq!(mime_type_from_path(Path::new("anim.gif")), "image/gif");
        assert_eq!(mime_type_from_path(Path::new("img.webp")), "image/webp");
    }

    #[test]
    fn mime_type_from_path_detects_document_types() {
        assert_eq!(mime_type_from_path(Path::new("doc.pdf")), "application/pdf");
        assert_eq!(mime_type_from_path(Path::new("file.txt")), "text/plain");
        assert_eq!(mime_type_from_path(Path::new("data.csv")), "text/csv");
        assert_eq!(
            mime_type_from_path(Path::new("report.docx")),
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        );
    }

    #[test]
    fn mime_type_from_path_falls_back_to_octet_stream() {
        assert_eq!(
            mime_type_from_path(Path::new("archive.xyz")),
            "application/octet-stream"
        );
        assert_eq!(
            mime_type_from_path(Path::new("noext")),
            "application/octet-stream"
        );
    }

    #[test]
    fn js_escape_filename_handles_special_characters() {
        assert_eq!(js_escape_filename("simple.png"), "simple.png");
        assert_eq!(js_escape_filename("it's a file.png"), "it\\'s a file.png");
        assert_eq!(js_escape_filename("back\\slash.png"), "back\\\\slash.png");
        assert_eq!(js_escape_filename("new\nline.png"), "new\\nline.png");
    }

    #[test]
    fn build_drag_event_js_uses_viewport_center() {
        let js = build_drag_event_js("dragenter");

        assert!(js.contains("dragenter"));
        assert!(js.contains("window.innerWidth/2"));
        assert!(js.contains("window.innerHeight/2"));
        assert!(js.contains("DragEvent"));
        assert!(js.contains("DataTransfer"));
        assert!(js.contains("elementFromPoint"));
    }

    #[test]
    fn build_drag_event_js_supports_all_event_types() {
        assert!(build_drag_event_js("dragenter").contains("dragenter"));
        assert!(build_drag_event_js("dragover").contains("dragover"));
    }

    #[test]
    fn build_file_drop_js_returns_none_for_empty_paths() {
        let result = build_file_drop_js(&[]);
        assert!(result.is_none());
    }

    #[test]
    fn build_file_drop_js_returns_none_for_nonexistent_paths() {
        let result = build_file_drop_js(&[std::path::PathBuf::from("/nonexistent/file.png")]);
        assert!(result.is_none());
    }

    #[test]
    fn build_file_drop_js_generates_drop_sequence_at_viewport_center() {
        let dir = std::env::temp_dir().join("ferx_test_drop");
        let _ = std::fs::create_dir_all(&dir);
        let test_file = dir.join("test.png");
        std::fs::write(&test_file, b"fake png data").unwrap();

        let result = build_file_drop_js(std::slice::from_ref(&test_file));
        let _ = std::fs::remove_file(&test_file);
        let _ = std::fs::remove_dir(&dir);

        let js = result.expect("should produce JS for a valid file");
        assert!(js.contains("dragenter"));
        assert!(js.contains("dragover"));
        assert!(js.contains("drop"));
        assert!(js.contains("test.png"));
        assert!(js.contains("image/png"));
        assert!(js.contains("atob"));
        assert!(js.contains("window.innerWidth/2"));
        assert!(js.contains("window.innerHeight/2"));
    }
}
