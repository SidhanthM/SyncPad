use hostname::get;
use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::collections::HashMap;

pub fn register_service() -> anyhow::Result<ServiceDaemon> {
    let mdns =
        ServiceDaemon::new().map_err(|e| anyhow::anyhow!("Failed to create mDNS daemon: {}", e))?;

    let service_type = "_syncpad._tcp.local.";
    let hostname = get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "SyncPad-Desktop".to_string());
    let instance_name = format!("SyncPad on {}", hostname);
    let port = 8081;
    let properties = HashMap::new();

    let service_info = ServiceInfo::new(
        service_type,
        &instance_name,
        &format!("{}.local.", hostname),
        "",
        port,
        properties,
    )
    .map_err(|e| anyhow::anyhow!("Failed to create mDNS service info: {}", e))?;

    mdns.register(service_info)
        .map_err(|e| anyhow::anyhow!("Failed to register mDNS service: {}", e))?;
    println!(
        "mDNS service registered: {}._syncpad._tcp.local. on port {}",
        instance_name, port
    );
    Ok(mdns)
}
