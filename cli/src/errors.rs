use clap::error::ErrorKind;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    General,
    DocumentNotFound,
    FolderNotFound,
    InvalidArguments,
    NotImplemented,
    PermissionDenied,
}

impl ErrorCode {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::General => "general",
            Self::DocumentNotFound => "document_not_found",
            Self::FolderNotFound => "folder_not_found",
            Self::InvalidArguments => "invalid_arguments",
            Self::NotImplemented => "not_implemented",
            Self::PermissionDenied => "permission_denied",
        }
    }
}

#[derive(Debug, Error)]
pub enum CliError {
    #[error("command '{command}' is not implemented yet")]
    NotImplemented { command: String },

    #[error("{message}")]
    InvalidArguments { message: String },

    #[error("{message}")]
    DocumentNotFound { message: String },

    #[error("{message}")]
    FolderNotFound { message: String },

    #[error("{message}")]
    PermissionDenied { message: String },

    #[error("{message}")]
    General { message: String },
}

impl CliError {
    pub fn not_implemented(command: impl Into<String>) -> Self {
        Self::NotImplemented {
            command: command.into(),
        }
    }

    pub fn invalid_arguments(message: impl Into<String>) -> Self {
        Self::InvalidArguments {
            message: message.into(),
        }
    }

    pub const fn code(&self) -> ErrorCode {
        match self {
            Self::NotImplemented { .. } => ErrorCode::NotImplemented,
            Self::InvalidArguments { .. } => ErrorCode::InvalidArguments,
            Self::DocumentNotFound { .. } => ErrorCode::DocumentNotFound,
            Self::FolderNotFound { .. } => ErrorCode::FolderNotFound,
            Self::PermissionDenied { .. } => ErrorCode::PermissionDenied,
            Self::General { .. } => ErrorCode::General,
        }
    }

    pub fn suggestion(&self) -> &'static str {
        match self {
            Self::NotImplemented { .. } => {
                "Use 'tentacle --help' to find supported commands in this release."
            }
            Self::DocumentNotFound { .. } => "Use 'tentacle list' to see available documents.",
            Self::FolderNotFound { .. } => "Use 'tentacle folder list' to see available folders.",
            Self::InvalidArguments { .. } => "Run with --help to see valid command usage.",
            Self::PermissionDenied { .. } => {
                "Check filesystem permissions for the configured documents folder."
            }
            Self::General { .. } => {
                "Retry the command. If it persists, inspect logs and run with RUST_BACKTRACE=1."
            }
        }
    }

    pub fn to_payload(&self) -> ErrorEnvelope {
        ErrorEnvelope {
            error: PublicError {
                code: self.code().as_str().to_owned(),
                message: self.to_string(),
                suggestion: self.suggestion().to_owned(),
            },
        }
    }

    pub fn exit_code(&self) -> u8 {
        exit_code_for(Some(self.code()))
    }
}

#[derive(Debug, Serialize)]
pub struct ErrorEnvelope {
    pub error: PublicError,
}

#[derive(Debug, Serialize)]
pub struct PublicError {
    pub code: String,
    pub message: String,
    pub suggestion: String,
}

// Single source of truth for CLI exit-code mapping.
pub const fn exit_code_for(code: Option<ErrorCode>) -> u8 {
    match code {
        None => 0,
        Some(ErrorCode::General) => 1,
        Some(ErrorCode::DocumentNotFound) => 2,
        Some(ErrorCode::FolderNotFound) => 3,
        Some(ErrorCode::InvalidArguments | ErrorCode::NotImplemented) => 4,
        Some(ErrorCode::PermissionDenied) => 5,
    }
}

pub const fn clap_exit_code(kind: ErrorKind) -> u8 {
    match kind {
        ErrorKind::DisplayHelp | ErrorKind::DisplayVersion => exit_code_for(None),
        _ => exit_code_for(Some(ErrorCode::InvalidArguments)),
    }
}

pub fn summarize_clap_error(error: &clap::Error) -> String {
    error
        .to_string()
        .lines()
        .next()
        .unwrap_or("invalid arguments")
        .trim()
        .to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_error_payload_uses_document_not_found_code() {
        let payload = CliError::DocumentNotFound {
            message: "missing".to_owned(),
        }
        .to_payload();
        assert_eq!(payload.error.code, "document_not_found");
        assert!(!payload.error.suggestion.is_empty());
    }

    #[test]
    fn output_error_payload_uses_not_implemented_code() {
        let payload = CliError::not_implemented("edit").to_payload();
        assert_eq!(payload.error.code, "not_implemented");
        assert!(payload.error.suggestion.contains("help"));
    }

    #[test]
    fn output_error_payload_uses_permission_denied_code() {
        let payload = CliError::PermissionDenied {
            message: "denied".to_owned(),
        }
        .to_payload();
        assert_eq!(payload.error.code, "permission_denied");
        assert!(payload.error.suggestion.contains("permissions"));
    }
}
