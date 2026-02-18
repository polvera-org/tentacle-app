use serde::Serialize;

use crate::errors::CliError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct SuccessEnvelope<'a> {
    status: &'static str,
    command: &'a str,
    message: &'static str,
}

pub fn print_scaffold_success(command: &str, json: bool) {
    if json {
        let payload = SuccessEnvelope {
            status: "ok",
            command,
            message: "command scaffold is in place",
        };

        match serde_json::to_string_pretty(&payload) {
            Ok(text) => println!("{text}"),
            Err(error) => eprintln!("failed to serialize JSON output: {error}"),
        }

        return;
    }

    println!("{command}: command scaffold is in place");
}

pub fn print_error(error: &CliError, json: bool) {
    if json {
        match serde_json::to_string_pretty(&error.to_payload()) {
            Ok(text) => eprintln!("{text}"),
            Err(ser_error) => eprintln!(
                "{{\"error\":{{\"code\":\"general\",\"message\":\"failed to serialize error payload: {ser_error}\"}}}}"
            ),
        }

        return;
    }

    eprintln!("error ({}): {}", to_code_label(error), error);
    if let Some(suggestion) = error.suggestion() {
        eprintln!("suggestion: {suggestion}");
    }
}

fn to_code_label(error: &CliError) -> &'static str {
    match error.code() {
        crate::errors::ErrorCode::General => "general",
        crate::errors::ErrorCode::DocumentNotFound => "document_not_found",
        crate::errors::ErrorCode::FolderNotFound => "folder_not_found",
        crate::errors::ErrorCode::InvalidArguments => "invalid_arguments",
        crate::errors::ErrorCode::NotImplemented => "not_implemented",
        crate::errors::ErrorCode::PermissionDenied => "permission_denied",
    }
}
