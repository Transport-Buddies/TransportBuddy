import L from "leaflet";

interface TransitIconOptions {
  id: string;
  bearing?: number;
  vehicleMode: string; // 'bus', 'rail', 'ferry', 'null'
}

export function createTransitIcon({ id, bearing = 0, vehicleMode}: TransitIconOptions): L.DivIcon {
  const displayId = id.length <= 4 ? id : "";

  const iconMap: Record<string, string> = {
    bus: 'assets/bus.svg',
    rail: 'assets/rail.svg',
    ferry: 'assets/ferry.svg',
    null: 'assets/bus.svg',
  };

  const iconUrl = iconMap[vehicleMode || 'null'];
  console.log(`Creating transit icon for mode: ${vehicleMode}, using icon: ${iconUrl}`);
  const markerHtml = `
    <div style="
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background-image: url('${iconUrl}');
      background-size: contain;
      background-repeat: no-repeat;
      background-position: center;
      color: white;
      transform: rotate(${bearing}deg);
    ">
      <div style="transform: rotate(-${bearing}deg); font-size: 12px;">${displayId}</div>
    </div>
  `;

  return L.divIcon({
    className: "vehicle-icon",
    html: markerHtml,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}
