use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::errors::CliError;

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
struct SuccessEnvelope<'a> {
    status: &'static str,
    command: &'a str,
    message: &'static str,
}

pub fn print_scaffold_success(command: &str, json: bool) {
    if json {
        let payload = SuccessEnvelope {
            status: "ok",
            command,
            message: "command scaffold is in place",
        };

        if let Err(error) = print_json(&payload) {
            eprintln!("failed to serialize JSON output: {error}");
        }

        return;
    }

    println!("{command}: command scaffold is in place");
}

pub fn print_json<T: Serialize>(value: &T) -> Result<(), CliError> {
    let output = serde_json::to_string_pretty(value).map_err(|error| CliError::General {
        message: format!("failed to serialize JSON output: {error}"),
    })?;
    println!("{output}");
    Ok(())
}

pub fn print_error(error: &CliError, json: bool) {
    if json {
        match serde_json::to_string_pretty(&error.to_payload()) {
            Ok(text) => eprintln!("{text}"),
            Err(ser_error) => eprintln!(
                "{{\"error\":{{\"code\":\"general\",\"message\":\"failed to serialize error payload: {ser_error}\",\"suggestion\":\"Retry the command with --help for usage details.\"}}}}"
            ),
        }

        return;
    }

    eprintln!("error ({}): {}", error.code().as_str(), error);
    eprintln!("suggestion: {}", error.suggestion());
}

pub fn normalize_iso8601(value: &str) -> String {
    parse_iso8601_to_unix_seconds(value)
        .map(format_unix_seconds_utc)
        .unwrap_or_else(|| value.to_owned())
}

pub fn humanize_datetime(value: &str) -> String {
    let Some(now_unix_seconds) = now_unix_seconds() else {
        return value.to_owned();
    };
    humanize_datetime_at(value, now_unix_seconds)
}

pub fn format_bytes(size_bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if size_bytes < 1024 {
        return format!("{size_bytes} B");
    }

    let mut value = size_bytes as f64;
    let mut unit_index = 0usize;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    format!("{value:.1} {}", UNITS[unit_index])
}

fn now_unix_seconds() -> Option<i64> {
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).ok()?;
    i64::try_from(duration.as_secs()).ok()
}

fn humanize_datetime_at(value: &str, now_unix_seconds: i64) -> String {
    let Some(parsed_unix_seconds) = parse_iso8601_to_unix_seconds(value) else {
        return value.to_owned();
    };

    describe_relative_delta(now_unix_seconds - parsed_unix_seconds)
}

fn describe_relative_delta(delta_seconds: i64) -> String {
    let is_future = delta_seconds < 0;
    let absolute_seconds = delta_seconds.unsigned_abs();

    if absolute_seconds < 60 {
        return if is_future {
            "in less than a minute".to_owned()
        } else {
            "just now".to_owned()
        };
    }

    let (value, unit) = if absolute_seconds < 3_600 {
        (absolute_seconds / 60, "minute")
    } else if absolute_seconds < 86_400 {
        (absolute_seconds / 3_600, "hour")
    } else if absolute_seconds < 604_800 {
        (absolute_seconds / 86_400, "day")
    } else if absolute_seconds < 2_592_000 {
        (absolute_seconds / 604_800, "week")
    } else if absolute_seconds < 31_536_000 {
        (absolute_seconds / 2_592_000, "month")
    } else {
        (absolute_seconds / 31_536_000, "year")
    };

    let suffix = if value == 1 { "" } else { "s" };
    if is_future {
        format!("in {value} {unit}{suffix}")
    } else {
        format!("{value} {unit}{suffix} ago")
    }
}

fn parse_iso8601_to_unix_seconds(value: &str) -> Option<i64> {
    let trimmed = value.trim();
    let bytes = trimmed.as_bytes();
    if bytes.len() < 20 {
        return None;
    }

    if bytes[4] != b'-'
        || bytes[7] != b'-'
        || !(bytes[10] == b'T' || bytes[10] == b't')
        || bytes[13] != b':'
        || bytes[16] != b':'
    {
        return None;
    }

    let year = parse_i64_component(trimmed, 0, 4)?;
    let month = parse_i64_component(trimmed, 5, 7)?;
    let day = parse_i64_component(trimmed, 8, 10)?;
    let hour = parse_i64_component(trimmed, 11, 13)?;
    let minute = parse_i64_component(trimmed, 14, 16)?;
    let second = parse_i64_component(trimmed, 17, 19)?;

    if !(1..=12).contains(&month)
        || day < 1
        || day > i64::from(days_in_month(year, month as u8)?)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=59).contains(&second)
    {
        return None;
    }

    let mut index = 19usize;
    if bytes.get(index) == Some(&b'.') {
        index += 1;
        let fraction_start = index;
        while bytes
            .get(index)
            .copied()
            .is_some_and(|byte| byte.is_ascii_digit())
        {
            index += 1;
        }
        if index == fraction_start {
            return None;
        }
    }

    let offset_seconds = parse_timezone_offset_seconds(trimmed, index)?;
    let days_since_epoch = days_from_civil(year, month, day);
    let local_seconds = days_since_epoch
        .checked_mul(86_400)?
        .checked_add(hour * 3_600)?
        .checked_add(minute * 60)?
        .checked_add(second)?;
    local_seconds.checked_sub(i64::from(offset_seconds))
}

fn parse_timezone_offset_seconds(value: &str, start: usize) -> Option<i32> {
    let bytes = value.as_bytes();
    if bytes.get(start) == Some(&b'Z') && start + 1 == bytes.len() {
        return Some(0);
    }

    if start + 6 != bytes.len() {
        return None;
    }

    let sign = match bytes[start] {
        b'+' => 1i32,
        b'-' => -1i32,
        _ => return None,
    };
    if bytes[start + 3] != b':' {
        return None;
    }

    let hour = parse_i32_component(value, start + 1, start + 3)?;
    let minute = parse_i32_component(value, start + 4, start + 6)?;
    if !(0..=23).contains(&hour) || !(0..=59).contains(&minute) {
        return None;
    }

    let base = hour.checked_mul(3_600)?.checked_add(minute * 60)?;
    base.checked_mul(sign)
}

fn parse_i64_component(value: &str, start: usize, end: usize) -> Option<i64> {
    value.get(start..end)?.parse::<i64>().ok()
}

fn parse_i32_component(value: &str, start: usize, end: usize) -> Option<i32> {
    value.get(start..end)?.parse::<i32>().ok()
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: u8) -> Option<u8> {
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => return None,
    };
    Some(days)
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = year - if month <= 2 { 1 } else { 0 };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let year_of_era = y - era * 400;
    let month_prime = month + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn format_unix_seconds_utc(seconds_since_epoch: i64) -> String {
    let days_since_epoch = seconds_since_epoch.div_euclid(86_400);
    let seconds_within_day = seconds_since_epoch.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days_since_epoch);
    let hour = seconds_within_day / 3_600;
    let minute = (seconds_within_day % 3_600) / 60;
    let second = seconds_within_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }

    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn output_normalize_iso8601_converts_offset_to_utc() {
        let normalized = normalize_iso8601("2026-02-17T16:30:00+02:00");
        assert_eq!(normalized, "2026-02-17T14:30:00Z");
    }

    #[test]
    fn output_normalize_iso8601_keeps_invalid_values() {
        let normalized = normalize_iso8601("invalid-date");
        assert_eq!(normalized, "invalid-date");
    }

    #[test]
    fn output_humanize_datetime_uses_relative_past() {
        let now = parse_iso8601_to_unix_seconds("2026-02-18T12:00:00Z").unwrap();
        let value = humanize_datetime_at("2026-02-18T10:00:00Z", now);
        assert_eq!(value, "2 hours ago");
    }

    #[test]
    fn output_humanize_datetime_uses_relative_future() {
        let now = parse_iso8601_to_unix_seconds("2026-02-18T12:00:00Z").unwrap();
        let value = humanize_datetime_at("2026-02-18T12:45:00Z", now);
        assert_eq!(value, "in 45 minutes");
    }

    #[test]
    fn output_humanize_datetime_keeps_invalid_values() {
        let now = parse_iso8601_to_unix_seconds("2026-02-18T12:00:00Z").unwrap();
        let value = humanize_datetime_at("not-a-date", now);
        assert_eq!(value, "not-a-date");
    }
}
