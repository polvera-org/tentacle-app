use clap::{ArgGroup, Args, Parser, Subcommand, ValueEnum};

#[derive(Debug, Parser)]
#[command(
    name = "tentacle",
    about = "Tentacle command-line interface",
    version,
    arg_required_else_help = true
)]
pub struct Cli {
    #[arg(
        long,
        global = true,
        help = "Output in JSON format for machine parsing"
    )]
    pub json: bool,

    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    // System
    Init,
    Config {
        #[command(subcommand)]
        command: Option<ConfigCommands>,
    },
    Status,
    Reindex(ReindexArgs),

    // Discovery
    List(ListArgs),
    Search(SearchArgs),
    Read(ReadArgs),

    // Operations
    Create(CreateArgs),
    Tag(TagArgs),

    // Deferred operations
    Edit(EditArgs),
    Import(ImportArgs),
    Export(ExportArgs),
    Delete(DeleteArgs),

    // Folder subcommands
    Folder {
        #[command(subcommand)]
        command: FolderCommands,
    },
}

#[derive(Debug, Subcommand)]
pub enum ConfigCommands {
    Get { key: String },
    Set { key: String, value: String },
}

#[derive(Debug, Args)]
pub struct ReindexArgs {
    #[arg(long)]
    pub folder: Option<String>,
}

#[derive(Debug, Clone, ValueEnum)]
pub enum ListSort {
    Created,
    Modified,
    Title,
}

#[derive(Debug, Args)]
pub struct ListArgs {
    #[arg(long)]
    pub folder: Option<String>,

    #[arg(long)]
    pub limit: Option<usize>,

    #[arg(long, value_enum)]
    pub sort: Option<ListSort>,

    #[arg(long)]
    pub desc: bool,
}

#[derive(Debug, Args)]
pub struct SearchArgs {
    pub query: String,

    #[arg(long)]
    pub folder: Option<String>,

    #[arg(long)]
    pub tags: Option<String>,

    #[arg(long)]
    pub limit: Option<usize>,

    #[arg(long)]
    pub snippets: bool,
}

#[derive(Debug, Args)]
pub struct ReadArgs {
    pub document_id: String,

    #[arg(long)]
    pub metadata: bool,
}

#[derive(Debug, Args)]
pub struct CreateArgs {
    #[arg(long)]
    pub folder: Option<String>,

    #[arg(long)]
    pub title: Option<String>,

    #[arg(long)]
    pub tags: Option<String>,
}

#[derive(Debug, Args)]
pub struct TagArgs {
    pub document_id: String,

    pub tags: Option<String>,

    #[arg(long, conflicts_with = "replace")]
    pub remove: bool,

    #[arg(long)]
    pub replace: bool,
}

#[derive(Debug, Args)]
pub struct EditArgs {
    pub document_id: String,
}

#[derive(Debug, Args)]
pub struct ImportArgs {
    pub source_path: String,

    #[arg(long)]
    pub folder: Option<String>,

    #[arg(long)]
    pub tags: Option<String>,

    #[arg(long)]
    pub title: Option<String>,
}

#[derive(Debug, Args)]
#[command(group(
    ArgGroup::new("export_source")
        .required(true)
        .args(["document_id", "folder"])
))]
pub struct ExportArgs {
    #[arg(value_name = "DOCUMENT_ID")]
    pub document_id: Option<String>,

    #[arg(value_name = "DESTINATION_PATH")]
    pub destination_path: String,

    #[arg(long, conflicts_with = "document_id")]
    pub folder: Option<String>,

    #[arg(long)]
    pub format: Option<String>,
}

#[derive(Debug, Args)]
pub struct DeleteArgs {
    pub document_id: String,

    #[arg(long)]
    pub force: bool,
}

#[derive(Debug, Subcommand)]
pub enum FolderCommands {
    List,
    Create {
        name: String,
    },
    Delete {
        name: String,

        #[arg(long)]
        force: bool,
    },
    Rename {
        old_name: String,
        new_name: String,
    },
}
