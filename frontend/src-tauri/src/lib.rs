use std::sync::Mutex;
use tentacle_core::config::ConfigStore;

#[tauri::command]
fn get_config(
  key: String,
  store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Option<String>, String> {
  let store = store.lock().map_err(|err| err.to_string())?;
  store.get(&key).map_err(|err| err.to_string())
}

#[tauri::command]
fn set_config(
  key: String,
  value: String,
  store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
  let store = store.lock().map_err(|err| err.to_string())?;
  store.set(&key, &value).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_all_config(
  store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<std::collections::HashMap<String, String>, String> {
  let store = store.lock().map_err(|err| err.to_string())?;
  store.get_all().map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      get_config,
      set_config,
      get_all_config
    ])
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .setup(|app| {
      let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| tentacle_core::config::default_data_dir().expect("no data dir"));
      let store = ConfigStore::new(&data_dir).expect("failed to init config");
      app.manage(Mutex::new(store));

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
