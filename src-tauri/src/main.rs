// Hindrer et ekstra konsollvindu på Windows i release-bygg. IKKE FJERN!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    medaljemaker_lib::run();
}
