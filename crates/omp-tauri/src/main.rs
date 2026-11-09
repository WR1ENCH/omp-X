fn main() {
    omp_tauri::build()
        .run(tauri::generate_context!())
        .expect("failed to run omp");
}