// A space's theme, as it is kept (JSON in the `spaces` table) and as the page
// sends it. The renderer's `utils/theme.ts` has the same shape.

use serde::{Deserialize, Serialize};

/// The primary colour, as HSB in Display P3, each part 0–1.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Hsb {
    pub hue: f64,
    pub saturation: f64,
    pub brightness: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Wheel {
    Complimentary,
    Analogous,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Appearance {
    Auto,
    Light,
    Dark,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Texture {
    Grain,
    Sand,
    Denim,
    Tweed,
}

/// Missing fields take their defaults, so a later field needs no migration.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpaceTheme {
    /// The others are derived from it.
    pub primary: Hsb,
    /// 1–3.
    #[serde(default = "one")]
    pub colors: u8,
    #[serde(default = "complimentary")]
    pub wheel: Wheel,
    #[serde(default = "auto")]
    pub appearance: Appearance,
    /// 0–1.
    #[serde(default = "intensity")]
    pub intensity: f64,
    /// 0–1, in steps of 0.05.
    #[serde(default)]
    pub noise: f64,
    #[serde(default = "grain")]
    pub texture: Texture,
}

fn one() -> u8 {
    1
}
fn complimentary() -> Wheel {
    Wheel::Complimentary
}
fn auto() -> Appearance {
    Appearance::Auto
}
fn intensity() -> f64 {
    0.8
}
fn grain() -> Texture {
    Texture::Grain
}

fn unit(value: f64) -> Result<f64, String> {
    if value.is_finite() {
        Ok(value.clamp(0.0, 1.0))
    } else {
        Err("A theme's numbers must be finite.".into())
    }
}

impl SpaceTheme {
    /// The theme of a colour like `#6f00ff`, as a new space has it.
    pub fn default_for(hex: &str) -> SpaceTheme {
        SpaceTheme {
            primary: hsb_of(hex).unwrap_or(Hsb {
                hue: 0.0,
                saturation: 0.0,
                brightness: 0.9,
            }),
            colors: 1,
            wheel: Wheel::Complimentary,
            appearance: Appearance::Auto,
            intensity: 0.8,
            noise: 0.0,
            texture: Texture::Grain,
        }
    }

    /// The theme with every number in range, or why it can't be.
    pub fn checked(mut self) -> Result<SpaceTheme, String> {
        self.primary = Hsb {
            hue: unit(self.primary.hue)?,
            saturation: unit(self.primary.saturation)?,
            brightness: unit(self.primary.brightness)?,
        };
        if !(1..=3).contains(&self.colors) {
            return Err("A theme has one to three colors.".into());
        }
        self.intensity = unit(self.intensity)?;
        self.noise = (unit(self.noise)? * 20.0).round() / 20.0;
        Ok(self)
    }
}

// HSB of a `#rrggbb` colour, its parts read as they are.
fn hsb_of(hex: &str) -> Option<Hsb> {
    let digits = hex.strip_prefix('#')?;
    if digits.len() != 6 || !digits.is_ascii() {
        return None;
    }
    let part =
        |at: usize| u8::from_str_radix(&digits[at..at + 2], 16).map(|v| f64::from(v) / 255.0);
    let (r, g, b) = (part(0).ok()?, part(2).ok()?, part(4).ok()?);
    let max = r.max(g).max(b);
    let delta = max - r.min(g).min(b);
    let sector = if delta == 0.0 {
        0.0
    } else if max == r {
        ((g - b) / delta).rem_euclid(6.0)
    } else if max == g {
        (b - r) / delta + 2.0
    } else {
        (r - g) / delta + 4.0
    };
    Some(Hsb {
        hue: sector / 6.0,
        saturation: if max == 0.0 { 0.0 } else { delta / max },
        brightness: max,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_to_hsb() {
        let theme = SpaceTheme::default_for("#0a84ff");
        assert!((theme.primary.hue - 0.5837).abs() < 0.001);
        assert!((theme.primary.saturation - 0.9608).abs() < 0.001);
        assert_eq!(theme.primary.brightness, 1.0);
        assert_eq!(SpaceTheme::default_for("#ff0000").primary.hue, 0.0);
    }

    #[test]
    fn missing_fields_default() {
        let theme: SpaceTheme =
            serde_json::from_str(r#"{"primary":{"hue":0.1,"saturation":0.2,"brightness":0.3}}"#)
                .unwrap();
        assert_eq!(theme.colors, 1);
        assert_eq!(theme.intensity, 0.8);
        assert_eq!(theme.noise, 0.0);
    }

    #[test]
    fn checks_clamp_and_snap() {
        let mut theme = SpaceTheme::default_for("#ffffff");
        theme.intensity = 1.5;
        theme.noise = 0.37;
        let theme = theme.checked().unwrap();
        assert_eq!(theme.intensity, 1.0);
        assert!((theme.noise - 0.35).abs() < 1e-9);

        let mut theme = SpaceTheme::default_for("#ffffff");
        theme.colors = 4;
        assert!(theme.checked().is_err());
    }
}
