mod cli;
mod errors;
mod output;

use clap::Parser;
use std::process::ExitCode;

use crate::cli::{Cli, Commands, FolderCommands};
use crate::errors::{clap_exit_code, exit_code_for, summarize_clap_error, CliError};

fn main() -> ExitCode {
    let json_requested = std::env::args().skip(1).any(|arg| arg == "--json");

    let cli = match Cli::try_parse() {
        Ok(parsed) => parsed,
        Err(error) => {
            let kind = error.kind();
            let code = clap_exit_code(kind);

            match kind {
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion => {
                    let _ = error.print();
                }
                _ if json_requested => {
                    let cli_error = CliError::invalid_arguments(summarize_clap_error(&error));
                    output::print_error(&cli_error, true);
                }
                _ => {
                    let _ = error.print();
                }
            }

            return ExitCode::from(code);
        }
    };

    match run(&cli.command) {
        Ok(command_name) => {
            output::print_scaffold_success(command_name, cli.json);
            ExitCode::from(exit_code_for(None))
        }
        Err(error) => {
            output::print_error(&error, cli.json);
            ExitCode::from(error.exit_code())
        }
    }
}

fn run(command: &Commands) -> Result<&'static str, CliError> {
    match command {
        Commands::Init => Ok("init"),
        Commands::Config { .. } => Ok("config"),
        Commands::Status => Ok("status"),
        Commands::Reindex(_) => Ok("reindex"),

        Commands::List(_) => Ok("list"),
        Commands::Search(_) => Ok("search"),
        Commands::Read(_) => Ok("read"),

        Commands::Create(_) => Ok("create"),
        Commands::Tag(_) => Ok("tag"),

        Commands::Folder { command } => match command {
            FolderCommands::List => Ok("folder list"),
            FolderCommands::Create { .. } => Ok("folder create"),
            FolderCommands::Delete { .. } => Ok("folder delete"),
            FolderCommands::Rename { .. } => Ok("folder rename"),
        },

        Commands::Edit(_) => Err(CliError::not_implemented("edit")),
        Commands::Import(_) => Err(CliError::not_implemented("import")),
        Commands::Export(_) => Err(CliError::not_implemented("export")),
        Commands::Delete(_) => Err(CliError::not_implemented("delete")),
    }
}
