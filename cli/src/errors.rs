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

    pub fn suggestion(&self) -> Option<&'static str> {
        match self {
            Self::NotImplemented { .. } => {
                Some("This command is scaffolded but not implemented yet.")
            }
            Self::DocumentNotFound { .. } => {
                Some("Use 'tentacle list' to see available documents.")
            }
            Self::FolderNotFound { .. } => {
                Some("Use 'tentacle folder list' to see available folders.")
            }
            Self::InvalidArguments { .. } => Some("Run with --help to see valid command usage."),
            Self::PermissionDenied { .. } | Self::General { .. } => None,
        }
    }

    pub fn to_payload(&self) -> ErrorEnvelope {
        ErrorEnvelope {
            error: PublicError {
                code: self.code(),
                message: self.to_string(),
                suggestion: self.suggestion().map(str::to_owned),
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
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
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
