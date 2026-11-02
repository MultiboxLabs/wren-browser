// macOS's side of platform/property_list.rs: Foundation's own reader, then
// each object it made as JSON.

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_foundation::{
    NSArray, NSData, NSDate, NSDictionary, NSNumber, NSPropertyListMutabilityOptions,
    NSPropertyListSerialization, NSString,
};
use serde_json::{Map, Value};

pub fn parse(bytes: &[u8]) -> Option<Value> {
    let data = NSData::with_bytes(bytes);
    let object = unsafe {
        NSPropertyListSerialization::propertyListWithData_options_format_error(
            &data,
            NSPropertyListMutabilityOptions::Immutable,
            std::ptr::null_mut(),
        )
    }
    .ok()?;
    Some(json(&object))
}

fn json(object: &AnyObject) -> Value {
    if let Some(string) = object.downcast_ref::<NSString>() {
        return Value::String(string.to_string());
    }
    if let Some(dictionary) = object.downcast_ref::<NSDictionary>() {
        let mut map = Map::new();
        for key in dictionary.allKeys() {
            let (Some(name), Some(value)) = (
                key.downcast_ref::<NSString>(),
                dictionary.objectForKey(&key),
            ) else {
                continue;
            };
            map.insert(name.to_string(), json(&value));
        }
        return Value::Object(map);
    }
    if let Some(array) = object.downcast_ref::<NSArray>() {
        return Value::Array(
            array
                .iter()
                .map(|item: Retained<AnyObject>| json(&item))
                .collect(),
        );
    }
    if let Some(number) = object.downcast_ref::<NSNumber>() {
        // A boolean is a char; a real, a float or a double.
        let kind = unsafe { *number.objCType().as_ptr() } as u8;
        return match kind {
            b'c' | b'B' => Value::Bool(number.boolValue()),
            b'f' | b'd' => serde_json::Number::from_f64(number.doubleValue())
                .map_or(Value::Null, Value::Number),
            _ => Value::from(number.longLongValue()),
        };
    }
    if let Some(date) = object.downcast_ref::<NSDate>() {
        return Value::from((date.timeIntervalSince1970() * 1000.0) as i64);
    }
    Value::Null
}
