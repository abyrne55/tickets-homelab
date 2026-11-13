//! Liveness probe for the container: GET /health on 127.0.0.1:$PORT.
//! Exits 0 when the server answers 200 with the body `Up :)`, else 1.
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::process::ExitCode;
use std::time::Duration;

const TIMEOUT: Duration = Duration::from_secs(3);
const MAX_RESPONSE: u64 = 4096;
const REQUEST: &[u8] = b"GET /health HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n";

fn port() -> Result<u16, String> {
    match std::env::var("PORT") {
        Err(std::env::VarError::NotPresent) => Ok(3000),
        Err(_) => Err("PORT is not valid text".into()),
        Ok(v) => v.trim().parse().map_err(|_| format!("PORT is not a port number: {v}")),
    }
}

fn fetch(port: u16) -> Result<Vec<u8>, String> {
    let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
    let mut stream = TcpStream::connect_timeout(&addr, TIMEOUT).map_err(|e| format!("connect: {e}"))?;
    stream.set_read_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    stream.set_write_timeout(Some(TIMEOUT)).map_err(|e| e.to_string())?;
    stream.write_all(REQUEST).map_err(|e| format!("write: {e}"))?;
    let mut buf = Vec::new();
    stream.take(MAX_RESPONSE).read_to_end(&mut buf).map_err(|e| format!("read: {e}"))?;
    Ok(buf)
}

fn is_healthy(response: &[u8]) -> bool {
    let Some(split) = response.windows(4).position(|w| w == b"\r\n\r\n") else {
        return false;
    };
    let (head, body) = (&response[..split], &response[split + 4..]);
    let line = head.split(|&b| b == b'\r').next().unwrap_or(&[]);
    let status_ok = line.starts_with(b"HTTP/1.") && line.get(8) == Some(&b' ') && line.get(9..12) == Some(b"200") && matches!(line.get(12), None | Some(&b' '));
    status_ok && body.trim_ascii() == b"Up :)"
}

fn main() -> ExitCode {
    let result = port().and_then(fetch);
    match result {
        Ok(resp) if is_healthy(&resp) => ExitCode::SUCCESS,
        Ok(_) => {
            eprintln!("unhealthy: unexpected response from /health");
            ExitCode::FAILURE
        }
        Err(e) => {
            eprintln!("unhealthy: {e}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::is_healthy;

    #[test]
    fn ok_with_expected_body() {
        assert!(is_healthy(b"HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nUp :)"));
        assert!(is_healthy(b"HTTP/1.0 200 OK\r\n\r\nUp :)\n"));
    }

    #[test]
    fn rejects_non_200() {
        assert!(!is_healthy(b"HTTP/1.1 503 Service Unavailable\r\n\r\nUp :)"));
    }

    #[test]
    fn rejects_wrong_body() {
        assert!(!is_healthy(b"HTTP/1.1 200 OK\r\n\r\nSetup"));
        assert!(!is_healthy(b"HTTP/1.1 200 OK\r\n\r\n"));
    }

    #[test]
    fn rejects_garbage() {
        assert!(!is_healthy(b""));
        assert!(!is_healthy(b"HTTP/1.1 200"));
        assert!(!is_healthy(b"\xff\xfe\r\n\r\nUp :)"));
        assert!(!is_healthy(b"HTTP/1.1 2000 OK\r\n\r\nUp :)"));
    }
}
