use std::env;
use std::path::PathBuf;

fn main() {
    // The build script runs with the current directory set to the package directory
    // where Cargo.toml is located (cli/), so .env.local should be in the same directory
    let env_local_path = PathBuf::from(".env.local");

    // Load .env.local during build so we can embed the values into the binary
    if let Err(e) = dotenvy::from_filename(&env_local_path) {
        println!("cargo:warning=Failed to load .env.local: {:?}", e);
        println!("cargo:warning=Supabase credentials won't be embedded in binary");
        println!("cargo:warning=Looking in: {:?}", env::current_dir().unwrap().join(&env_local_path));
    }

    // Pass environment variables to rustc so option_env!() can capture them
    let url_set = if let Ok(url) = env::var("NEXT_PUBLIC_SUPABASE_URL") {
        println!("cargo:rustc-env=NEXT_PUBLIC_SUPABASE_URL={}", url);
        true
    } else {
        false
    };

    let key_set = if let Ok(key) = env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY") {
        println!("cargo:rustc-env=NEXT_PUBLIC_SUPABASE_ANON_KEY={}", key);
        true
    } else {
        false
    };

    if url_set && key_set {
        println!("cargo:warning=Supabase credentials successfully embedded in binary");
    } else {
        println!("cargo:warning=Some Supabase credentials missing - update notifications may not work");
    }

    // Re-run build script if .env.local changes
    println!("cargo:rerun-if-changed=.env.local");
}
