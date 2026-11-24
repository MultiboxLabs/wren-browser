// The pin queries' tests (db/pins.rs).

use super::*;
use crate::db::spaces::NewSpace;
use crate::db::test_db as db;
use crate::db::theme::SpaceTheme;

fn space(db: &Db, profile: &str) -> SpaceId {
    let space = NewSpace {
        name: "Space".into(),
        icon: "lucide:orbit".into(),
        theme: SpaceTheme::default_for("#ffffff"),
    };
    db.create_space(profile, space).unwrap().id
}

fn page(url: &str) -> PinPage {
    PinPage {
        url: url.into(),
        title: url.into(),
        favicon: None,
    }
}

fn tab(url: &str) -> NewPin {
    NewPin::Tab(page(url))
}

fn top(space: SpaceId) -> PinPlace {
    PinPlace::Space {
        space,
        parent: None,
    }
}

fn ids(rows: &[PinRow]) -> Vec<PinId> {
    rows.iter().map(|row| row.id).collect()
}

// What is in a folder's row.
fn items_of(row: &PinRow) -> &[PinRow] {
    match &row.kind {
        PinKind::Folder { items, .. } => items,
        _ => panic!("not a folder"),
    }
}

#[test]
fn pins_come_back_in_order_with_their_folders() {
    let db = db();
    let space = space(&db, "a");
    let first = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let folder = db
        .create_pin(
            &top(space),
            None,
            NewPin::Folder {
                name: " Work ".into(),
            },
        )
        .unwrap();
    let inside = PinPlace::Space {
        space,
        parent: Some(folder),
    };
    let deep = db.create_pin(&inside, None, tab("https://b/")).unwrap();
    // At the top, before the first.
    let before = db
        .create_pin(&top(space), Some(0), tab("https://c/"))
        .unwrap();

    let pins = db.space_pins(space).unwrap();
    assert_eq!(ids(&pins), vec![before, first, folder]);
    let PinKind::Folder { open, items } = &pins[2].kind else {
        panic!("not a folder");
    };
    assert!(open);
    assert_eq!(pins[2].name.as_deref(), Some("Work"));
    assert_eq!(ids(items), vec![deep]);
    assert_eq!(pins[0].kind, PinKind::Tab(page("https://c/")));
}

#[test]
fn a_split_keeps_both_pages() {
    let db = db();
    let split = NewPin::Split {
        first: page("https://a/"),
        second: page("https://b/"),
        layout: PinLayout::Stacked,
        ratio: 0.3,
    };
    let place = PinPlace::Favorites {
        profile: "a".into(),
    };
    db.create_pin(&place, None, split).unwrap();
    let favorites = db.favorites("a").unwrap();
    assert_eq!(
        favorites[0].kind,
        PinKind::Split {
            first: page("https://a/"),
            second: page("https://b/"),
            layout: PinLayout::Stacked,
            ratio: 0.3
        }
    );
}

#[test]
fn favourites_and_pins_are_kept_apart() {
    let db = db();
    let space = space(&db, "a");
    let favorite = PinPlace::Favorites {
        profile: "a".into(),
    };
    let fav = db.create_pin(&favorite, None, tab("https://a/")).unwrap();
    let pin = db.create_pin(&top(space), None, tab("https://b/")).unwrap();
    assert_eq!(ids(&db.favorites("a").unwrap()), vec![fav]);
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![pin]);
    assert!(db.favorites("b").unwrap().is_empty());
}

#[test]
fn a_folder_is_never_a_favourite() {
    let db = db();
    let favorite = PinPlace::Favorites {
        profile: "a".into(),
    };
    let folder = NewPin::Folder {
        name: "Work".into(),
    };
    assert!(db.create_pin(&favorite, None, folder).is_err());
}

#[test]
fn a_pin_goes_only_into_a_folder_of_its_space() {
    let db = db();
    let (one, two) = (space(&db, "a"), space(&db, "a"));
    let tab_pin = db.create_pin(&top(one), None, tab("https://a/")).unwrap();
    let folder = db
        .create_pin(&top(one), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    let into = |space, parent| PinPlace::Space {
        space,
        parent: Some(parent),
    };
    assert!(
        db.create_pin(&into(one, tab_pin), None, tab("https://b/"))
            .is_err()
    );
    assert!(
        db.create_pin(&into(two, folder), None, tab("https://b/"))
            .is_err()
    );
    assert!(
        db.create_pin(&into(one, folder), None, tab("https://b/"))
            .is_ok()
    );
}

#[test]
fn deleting_closes_the_gap_and_takes_a_folders_pins() {
    let db = db();
    let space = space(&db, "a");
    let first = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let folder = db
        .create_pin(&top(space), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    let last = db.create_pin(&top(space), None, tab("https://b/")).unwrap();
    let inside = PinPlace::Space {
        space,
        parent: Some(folder),
    };
    let deep = db.create_pin(&inside, None, tab("https://c/")).unwrap();

    assert_eq!(db.delete_pin(folder).unwrap(), vec![folder, deep]);
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![first, last]);
    assert!(db.delete_pin(deep).is_err());
    // The gap is closed: a pin made at index 1 lands between the two.
    let middle = db
        .create_pin(&top(space), Some(1), tab("https://d/"))
        .unwrap();
    assert_eq!(
        ids(&db.space_pins(space).unwrap()),
        vec![first, middle, last]
    );
}

#[test]
fn pins_go_with_their_space_and_profile() {
    let db = db();
    let (one, two) = (space(&db, "a"), space(&db, "a"));
    db.create_pin(&top(one), None, tab("https://a/")).unwrap();
    db.create_pin(&top(two), None, tab("https://b/")).unwrap();
    let favorite = PinPlace::Favorites {
        profile: "a".into(),
    };
    db.create_pin(&favorite, None, tab("https://c/")).unwrap();

    db.delete_space(one).unwrap();
    assert!(db.space_pins(one).unwrap().is_empty());
    db.conn
        .execute("DELETE FROM profiles WHERE id = 'a'", [])
        .unwrap();
    assert!(db.space_pins(two).unwrap().is_empty());
    assert!(db.favorites("a").unwrap().is_empty());
}

#[test]
fn a_pin_is_found_with_its_place_and_keeps_its_look() {
    let db = db();
    let space = space(&db, "a");
    let id = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let (profile, found_space, pin) = db.pin(id).unwrap().unwrap();
    assert_eq!((profile.as_str(), found_space), ("a", Some(space)));
    assert_eq!(pin.kind, PinKind::Tab(page("https://a/")));
    assert!(db.set_pin_look(id, 0, "A", Some(&[1, 2])).unwrap());
    assert!(!db.set_pin_look(id, 0, "A", Some(&[1, 2])).unwrap());
    let (_, _, pin) = db.pin(id).unwrap().unwrap();
    let PinKind::Tab(page) = pin.kind else {
        panic!("not a tab");
    };
    assert_eq!((page.title.as_str(), page.favicon), ("A", Some(vec![1, 2])));
    assert!(db.pin(id + 1).unwrap().is_none());
}

#[test]
fn a_pin_is_found_where_it_is_and_takes_another_page() {
    let db = db();
    let space = space(&db, "a");
    db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let id = db.create_pin(&top(space), None, tab("https://b/")).unwrap();
    assert_eq!(db.pin_place(id).unwrap(), Some((top(space), 1)));
    let favorite = db
        .create_pin(
            &PinPlace::Favorites {
                profile: "a".into(),
            },
            None,
            tab("https://c/"),
        )
        .unwrap();
    assert_eq!(
        db.pin_place(favorite).unwrap(),
        Some((
            PinPlace::Favorites {
                profile: "a".into()
            },
            0
        ))
    );
    db.set_pin_page(id, 0, &page("https://d/")).unwrap();
    let (_, _, pin) = db.pin(id).unwrap().unwrap();
    assert_eq!(pin.kind, PinKind::Tab(page("https://d/")));
    assert!(db.set_pin_page(id, 1, &page("https://e/")).is_err());
    assert!(db.pin_place(id + 10).unwrap().is_none());
}

#[test]
fn a_split_becomes_a_tab_of_the_side_it_keeps() {
    let db = db();
    let split = NewPin::Split {
        first: page("https://a/"),
        second: page("https://b/"),
        layout: PinLayout::SideBySide,
        ratio: 0.5,
    };
    let place = PinPlace::Favorites {
        profile: "a".into(),
    };
    let id = db.create_pin(&place, None, split).unwrap();
    db.split_to_tab(id, 1).unwrap();
    assert_eq!(
        db.favorites("a").unwrap()[0].kind,
        PinKind::Tab(page("https://b/"))
    );
    assert!(db.split_to_tab(id, 0).is_err());
}

#[test]
fn a_split_keeps_its_layout_ratio_and_order() {
    let db = db();
    let split = NewPin::Split {
        first: page("https://a/"),
        second: page("https://b/"),
        layout: PinLayout::SideBySide,
        ratio: 0.5,
    };
    let place = top(space(&db, "a"));
    let id = db.create_pin(&place, None, split).unwrap();
    db.set_pin_split(id, PinLayout::Stacked, 0.3, true).unwrap();
    let (_, _, pin) = db.pin(id).unwrap().unwrap();
    let expected = PinKind::Split {
        first: page("https://b/"),
        second: page("https://a/"),
        layout: PinLayout::Stacked,
        ratio: 0.3,
    };
    assert_eq!(pin.kind, expected);
    let tab = db.create_pin(&place, None, tab("https://c/")).unwrap();
    assert!(
        db.set_pin_split(tab, PinLayout::Stacked, 0.3, false)
            .is_err()
    );
}

#[test]
fn a_pin_is_last_used_when_made_until_it_is_used_again() {
    let db = db();
    let place = top(space(&db, "a"));
    let before = now();
    let id = db.create_pin(&place, None, tab("https://a/")).unwrap();
    let made = db.pin(id).unwrap().unwrap().2.last_active;
    assert!(made >= before && made <= now());
    db.set_pin_active(id, 42).unwrap();
    assert_eq!(db.pin(id).unwrap().unwrap().2.last_active, 42);
}

#[test]
fn a_pin_moves_between_places_and_both_close_up() {
    let db = db();
    let space = space(&db, "a");
    let favorites = PinPlace::Favorites {
        profile: "a".into(),
    };
    let one = db.create_pin(&favorites, None, tab("https://a/")).unwrap();
    let two = db.create_pin(&favorites, None, tab("https://b/")).unwrap();
    let pin = db.create_pin(&top(space), None, tab("https://c/")).unwrap();

    db.move_pin(one, &top(space), Some(0)).unwrap();
    assert_eq!(ids(&db.favorites("a").unwrap()), vec![two]);
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![one, pin]);
    // Within its place, to the end.
    db.move_pin(one, &top(space), None).unwrap();
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![pin, one]);
    db.move_pin(pin, &favorites, Some(0)).unwrap();
    assert_eq!(ids(&db.favorites("a").unwrap()), vec![pin, two]);
    // Made at index 1, each place is still dense.
    let three = db
        .create_pin(&favorites, Some(1), tab("https://d/"))
        .unwrap();
    assert_eq!(ids(&db.favorites("a").unwrap()), vec![pin, three, two]);
}

#[test]
fn a_folder_stays_out_of_the_favourites_and_itself() {
    let db = db();
    let space = space(&db, "a");
    let folder = db
        .create_pin(&top(space), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    let inner = PinPlace::Space {
        space,
        parent: Some(folder),
    };
    let deep = db
        .create_pin(&inner, None, NewPin::Folder { name: "G".into() })
        .unwrap();
    let favorites = PinPlace::Favorites {
        profile: "a".into(),
    };
    assert!(db.move_pin(folder, &favorites, None).is_err());
    let into_deep = PinPlace::Space {
        space,
        parent: Some(deep),
    };
    assert!(db.move_pin(folder, &into_deep, None).is_err());
    db.move_pin(deep, &top(space), Some(0)).unwrap();
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![deep, folder]);
}

#[test]
fn a_folder_takes_all_in_it_to_another_space() {
    let db = db();
    let (space, other) = (space(&db, "a"), space(&db, "a"));
    let stays = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let folder = db
        .create_pin(&top(space), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    let in_folder = |space, parent| PinPlace::Space {
        space,
        parent: Some(parent),
    };
    let inner = db
        .create_pin(&in_folder(space, folder), None, tab("https://b/"))
        .unwrap();
    let deep = db
        .create_pin(
            &in_folder(space, folder),
            None,
            NewPin::Folder { name: "G".into() },
        )
        .unwrap();
    let deepest = db
        .create_pin(&in_folder(space, deep), None, tab("https://c/"))
        .unwrap();
    let there = db.create_pin(&top(other), None, tab("https://d/")).unwrap();

    let mut moved = db.move_pin(folder, &top(other), Some(0)).unwrap();
    moved.sort();
    assert_eq!(moved, vec![folder, inner, deep, deepest]);
    assert_eq!(ids(&db.space_pins(space).unwrap()), vec![stays]);
    let pins = db.space_pins(other).unwrap();
    assert_eq!(ids(&pins), vec![folder, there]);
    assert_eq!(ids(items_of(&pins[0])), vec![inner, deep]);
    assert_eq!(ids(items_of(&items_of(&pins[0])[1])), vec![deepest]);
    // What is in it stays dense in its new space.
    let added = db
        .create_pin(&in_folder(other, folder), None, tab("https://e/"))
        .unwrap();
    let pins = db.space_pins(other).unwrap();
    assert_eq!(ids(items_of(&pins[0])), vec![inner, deep, added]);
}

#[test]
fn a_pin_goes_to_another_profile_with_all_in_it() {
    let db = db();
    let (space, other) = (space(&db, "a"), space(&db, "b"));
    let folder = db
        .create_pin(&top(space), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    let inside = PinPlace::Space {
        space,
        parent: Some(folder),
    };
    let inner = db.create_pin(&inside, None, tab("https://a/")).unwrap();
    let there = db.create_pin(&top(other), None, tab("https://b/")).unwrap();

    let mut moved = db.move_pin(folder, &top(other), Some(0)).unwrap();
    moved.sort();
    assert_eq!(moved, vec![folder, inner]);
    assert!(db.space_pins(space).unwrap().is_empty());
    let pins = db.space_pins(other).unwrap();
    assert_eq!(ids(&pins), vec![folder, there]);
    assert_eq!(ids(items_of(&pins[0])), vec![inner]);
    assert_eq!(db.pin(inner).unwrap().unwrap().0, "b");

    // A pin goes to another profile's favourites too, which close up after it.
    let favorite = db
        .create_pin(
            &PinPlace::Favorites {
                profile: "a".into(),
            },
            None,
            tab("https://c/"),
        )
        .unwrap();
    let theirs = PinPlace::Favorites {
        profile: "b".into(),
    };
    db.move_pin(favorite, &theirs, None).unwrap();
    db.move_pin(inner, &theirs, Some(0)).unwrap();
    assert!(db.favorites("a").unwrap().is_empty());
    assert_eq!(ids(&db.favorites("b").unwrap()), vec![inner, favorite]);
    assert!(items_of(&db.space_pins(other).unwrap()[0]).is_empty());
}

#[test]
fn a_name_can_be_cleared_except_a_folders() {
    let db = db();
    let space = space(&db, "a");
    let pin = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
    let folder = db
        .create_pin(&top(space), None, NewPin::Folder { name: "F".into() })
        .unwrap();
    db.rename_pin(pin, Some(" Mail ")).unwrap();
    assert_eq!(
        db.space_pins(space).unwrap()[0].name.as_deref(),
        Some("Mail")
    );
    db.rename_pin(pin, Some("  ")).unwrap();
    assert_eq!(db.space_pins(space).unwrap()[0].name, None);
    assert!(db.rename_pin(folder, None).is_err());
    db.set_folder_open(folder, false).unwrap();
    assert!(matches!(
        db.space_pins(space).unwrap()[1].kind,
        PinKind::Folder { open: false, .. }
    ));
    assert!(db.set_folder_open(pin, false).is_err());
}

#[test]
fn a_tab_becomes_a_split_with_a_page_on_either_side_in_either_layout() {
    let db = db();
    let space = space(&db, "a");
    for (side, made) in [(0, PinLayout::SideBySide), (1, PinLayout::Stacked)] {
        let id = db.create_pin(&top(space), None, tab("https://a/")).unwrap();
        db.tab_to_split(id, side, made, &page("https://b/"))
            .unwrap();
        let (_, _, pin) = db.pin(id).unwrap().unwrap();
        let PinKind::Split {
            first,
            second,
            layout,
            ratio,
        } = pin.kind
        else {
            panic!("not a split");
        };
        let urls = [first.url, second.url];
        assert_eq!(urls[side], "https://b/");
        assert_eq!(urls[1 - side], "https://a/");
        assert_eq!((layout, ratio), (made, 0.5));
        assert!(db.tab_to_split(id, 0, made, &page("https://c/")).is_err());
    }
}
