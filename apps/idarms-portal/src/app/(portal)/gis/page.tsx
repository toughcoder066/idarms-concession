import { ArrowUpRight, Map, MapPin, Search } from 'lucide-react';
import Link from 'next/link';
import { idarmsGet } from '@/lib/api';

interface PropertyLocation {
  id: string;
  externalPropertyId?: string;
  reference?: string;
  propertyType: string;
  status: string;
  latitude?: number | null;
  longitude?: number | null;
  gpsCoordinates?: string | null;
}

function locationLabel(property: PropertyLocation) {
  if (typeof property.latitude === 'number' && typeof property.longitude === 'number') {
    return {
      label: `${property.latitude.toFixed(5)}, ${property.longitude.toFixed(5)}`,
      query: `${property.latitude},${property.longitude}`,
    };
  }

  const value = property.gpsCoordinates;
  if (!value?.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length >= 2 && parsed.every((part) => typeof part === 'number')) {
      return { label: `${parsed[1].toFixed(5)}, ${parsed[0].toFixed(5)}`, query: `${parsed[1]},${parsed[0]}` };
    }
    if (parsed && typeof parsed === 'object' && 'coordinates' in parsed && Array.isArray(parsed.coordinates)) {
      const coordinates = parsed.coordinates;
      if (coordinates.length >= 2 && coordinates.every((part) => typeof part === 'number')) {
        return { label: `${coordinates[1].toFixed(5)}, ${coordinates[0].toFixed(5)}`, query: `${coordinates[1]},${coordinates[0]}` };
      }
    }
  } catch {
    const coordinates = value.split(',').map((part) => Number(part.trim()));
    if (coordinates.length === 2 && coordinates.every(Number.isFinite)) {
      return { label: `${coordinates[0].toFixed(5)}, ${coordinates[1].toFixed(5)}`, query: value };
    }
  }
  return { label: value, query: value };
}

export default async function GisPage() {
  const payload = await idarmsGet<{ data: PropertyLocation[] }>('properties', '/properties');
  const properties = payload?.data ?? [];
  const located = properties.flatMap((property) => {
    const location = locationLabel(property);
    return location ? [{ ...property, location }] : [];
  });

  return (
    <section className="entity-page">
      <div className="entity-hero module-hero">
        <div className="entity-hero-copy">
          <span className="entity-kicker"><span className="module-kicker-icon"><Map size={14} aria-hidden="true" /></span>GEOGRAPHIC INFORMATION</span>
          <h1>GIS &amp; mapping</h1>
          <p>Explore mapped property locations from the property register.</p>
        </div>
        <div className="module-total"><strong>{located.length.toLocaleString('en-GH')}</strong><small>Located properties</small></div>
      </div>

      <div className="gis-layout">
        <section className="gis-map-card">
          <div className="gis-map-art">
            <div className="map-grid-lines" aria-hidden="true" />
            <div className="map-surface">
              <span className="map-road road-one" />
              <span className="map-road road-two" />
              <span className="map-road road-three" />
              <span className="map-river" />
              <span className="map-label map-label-north">N</span>
              <span className="map-compass"><MapPin size={20} aria-hidden="true" /></span>
              <div className="map-empty-overlay"><Map size={22} aria-hidden="true" /><strong>Location overview</strong><span>Coordinates are listed alongside each record.</span></div>
            </div>
          </div>
          <div className="gis-map-caption"><span><Map size={15} aria-hidden="true" /><strong>Property location register</strong></span><small>Map tile services are not configured in this portal yet.</small></div>
        </section>
        <aside className="gis-summary-card">
          <div className="gis-summary-title"><span className="gis-summary-icon"><MapPin size={17} aria-hidden="true" /></span><div><strong>Location coverage</strong><small>From property register</small></div></div>
          <div className="gis-coverage"><strong>{properties.length ? Math.round((located.length / properties.length) * 100) : 0}%</strong><span>of properties have coordinates</span></div>
          <div className="gis-coverage-track"><span style={{ width: `${properties.length ? Math.round((located.length / properties.length) * 100) : 0}%` }} /></div>
          <div className="gis-summary-stats"><span>Mapped properties<strong>{located.length}</strong></span><span>Without coordinates<strong>{properties.length - located.length}</strong></span></div>
          <Link href="/properties" className="gis-directory-link">Open property register <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </aside>
      </div>

      <section className="directory-card gis-list-card">
        <div className="directory-heading">
          <div className="directory-title"><span className="directory-title-icon"><MapPin size={17} aria-hidden="true" /></span><div><h2>Mapped properties</h2><p>{located.length.toLocaleString('en-GH')} records with location data</p></div></div>
          <span className="gis-search-label"><Search size={14} aria-hidden="true" /> Coordinates sourced from property records</span>
        </div>
        {located.length === 0 ? (
          <div className="directory-empty"><span className="empty-mark"><MapPin size={20} aria-hidden="true" /></span><h3>No mapped properties yet</h3><p>{payload ? 'Property records with coordinates will be listed here.' : 'The property service is currently unavailable.'}</p></div>
        ) : (
          <div className="table-wrap directory-table-wrap">
            <table className="directory-table"><thead><tr><th>Property</th><th>Type</th><th>Coordinates</th><th>Status</th><th>Map</th></tr></thead>
              <tbody>{located.map((property) => <tr key={property.id}>
                <td><strong>{property.externalPropertyId ?? property.reference ?? property.id}</strong></td>
                <td>{property.propertyType.replaceAll('_', ' ')}</td>
                <td><span className="reference-value">{property.location.label}</span></td>
                <td><span className={`status-badge ${property.status === 'VERIFIED' ? 'positive' : 'pending'}`}><i />{property.status.replaceAll('_', ' ')}</span></td>
                <td><a className="map-open-link" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(property.location.query)}`} target="_blank" rel="noreferrer">Open map <ArrowUpRight size={13} aria-hidden="true" /></a></td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
