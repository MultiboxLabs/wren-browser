// Every browser the user may bring their things over from, by name, as the
// user looks for theirs: each its engine, configured, or a browser built on
// one. A folder is under the platform's data folder (Application Support,
// on macOS), and a key is the Keychain item a Chromium-based browser keeps
// its cookies' key in.

use super::browsers::arc::Arc;
use super::browsers::zen::Zen;
use super::engines::chromium::{Chromium, KeyItem};
use super::engines::gecko::Gecko;
use super::engines::safari::Safari;
use super::source::{About, Source};

const fn about(id: &'static str, name: &'static str, app: &'static str) -> About {
    About { id, name, app }
}

const fn key(service: &'static str, account: &'static str) -> KeyItem {
    KeyItem { service, account }
}

static ARC: Arc = Arc::new(Chromium::new(
    about("arc", "Arc", "company.thebrowser.Browser"),
    "Arc/User Data",
    key("Arc Safe Storage", "Arc"),
));
static BRAVE: Chromium = Chromium::new(
    about("brave", "Brave", "com.brave.Browser"),
    "BraveSoftware/Brave-Browser",
    key("Brave Safe Storage", "Brave"),
);
static CHROME: Chromium = Chromium::new(
    about("chrome", "Chrome", "com.google.Chrome"),
    "Google/Chrome",
    key("Chrome Safe Storage", "Chrome"),
);
static DIA: Chromium = Chromium::new(
    about("dia", "Dia", "company.thebrowser.dia"),
    "Dia/User Data",
    key("Dia Safe Storage", "Dia"),
);
static EDGE: Chromium = Chromium::new(
    about("edge", "Edge", "com.microsoft.edgemac"),
    "Microsoft Edge",
    key("Microsoft Edge Safe Storage", "Microsoft Edge"),
);
static FIREFOX: Gecko = Gecko::new(
    about("firefox", "Firefox", "org.mozilla.firefox"),
    "Firefox",
);
static HELIUM: Chromium = Chromium::new(
    about("helium", "Helium", "net.imput.helium"),
    "net.imput.helium",
    key("Helium Storage Key", "Helium"),
);
static OPERA: Chromium = Chromium::new(
    about("opera", "Opera", "com.operasoftware.Opera"),
    "com.operasoftware.Opera",
    key("Opera Safe Storage", "Opera"),
)
.with_one_profile();
static SAFARI: Safari = Safari::new(about("safari", "Safari", "com.apple.Safari"));
static VIVALDI: Chromium = Chromium::new(
    about("vivaldi", "Vivaldi", "com.vivaldi.Vivaldi"),
    "Vivaldi",
    key("Vivaldi Safe Storage", "Vivaldi"),
);
static ZEN: Zen = Zen::new(Gecko::new(
    about("zen", "Zen", "app.zen-browser.zen"),
    "zen",
));

pub static SOURCES: [&dyn Source; 11] = [
    &ARC, &BRAVE, &CHROME, &DIA, &EDGE, &FIREFOX, &HELIUM, &OPERA, &SAFARI, &VIVALDI, &ZEN,
];
