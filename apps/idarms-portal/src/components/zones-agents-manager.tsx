'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, Trash2, UserPlus, UsersRound } from 'lucide-react';
import { assignAgentAction, createZoneAction, removeAgentAction } from '@/app/concessions/actions';
import type { AgentAssignment, GisZone } from '@/lib/concessions';

export function ZonesAgentsManager({
  assemblyId,
  assemblyName,
  zones,
  agents,
  canManage,
}: {
  assemblyId: string;
  assemblyName: string;
  zones: GisZone[];
  agents: AgentAssignment[];
  canManage: boolean;
}) {
  const [zoneCode, setZoneCode] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentZone, setAgentZone] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const router = useRouter();

  async function addZone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending('zone');
    setResult(null);
    const response = await createZoneAction({ assemblyId, zoneCode, zoneName });
    setResult(response);
    setPending(null);
    if (response.ok) {
      setZoneCode('');
      setZoneName('');
      router.refresh();
    }
  }

  async function addAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending('agent');
    setResult(null);
    const response = await assignAgentAction({ assemblyId, agentName, agentEmail, zoneId: agentZone || undefined });
    setResult(response);
    setPending(null);
    if (response.ok) {
      setAgentName('');
      setAgentEmail('');
      setAgentZone('');
      router.refresh();
    }
  }

  async function remove(agentId: string) {
    setPending(agentId);
    setResult(null);
    const response = await removeAgentAction({ assemblyId, agentId });
    setResult(response);
    setPending(null);
    if (response.ok) router.refresh();
  }

  return (
    <>
      <div className="zones-agents-grid">
        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><span className="dashboard-section-label">SPATIAL COVERAGE</span><h2>Zones &amp; blocks</h2><p>{zones.length} {zones.length === 1 ? 'zone' : 'zones'} · {zones.reduce((total, zone) => total + (zone._count?.blocks ?? 0), 0)} blocks</p></div></div>
          <div className="zone-map-mini">
            <div className="map-grid-lines" aria-hidden="true" />
            <span className="map-road road-one" /><span className="map-road road-two" />
            {zones.slice(0, 7).map((zone, index) => (
              <span key={zone.id} className={`zone-tile zone-${(index % 4) + 1}`}><strong>{zone.zoneCode}</strong><small>{zone._count?.blocks ?? 0} blocks</small></span>
            ))}
            {zones.length === 0 && <div className="map-empty-overlay"><MapPin size={19} aria-hidden="true" /><strong>No zones imported</strong><span>Add a zone to start readiness coverage for {assemblyName}.</span></div>}
          </div>
          {canManage && (
            <form className="zone-create-form" onSubmit={addZone}>
              <input value={zoneCode} onChange={(event) => setZoneCode(event.target.value)} placeholder="Zone code" required aria-label="Zone code" />
              <input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Zone name" required aria-label="Zone name" />
              <button className="button button-secondary" type="submit" disabled={pending === 'zone'}><Plus size={14} aria-hidden="true" /> {pending === 'zone' ? 'Adding…' : 'Add zone'}</button>
            </form>
          )}
          {zones.length === 0 ? <p className="directory-footnote">Zones are spatial records owned by the GIS service. Block geometry can be added through the GIS import pipeline.</p> : (
            <div className="zone-list">{zones.map((zone) => <div key={zone.id} className="zone-list-row"><span className="zone-list-icon"><MapPin size={14} aria-hidden="true" /></span><span><strong>{zone.zoneName}</strong><small>{zone.zoneCode} · {zone._count?.blocks ?? 0} blocks</small></span><span className={`status-badge ${(zone._count?.blocks ?? 0) > 0 ? 'positive' : 'pending'}`}><i />{(zone._count?.blocks ?? 0) > 0 ? 'Mapped' : 'No blocks'}</span></div>)}</div>
          )}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-heading"><div><span className="dashboard-section-label">FIELD OPERATIONS</span><h2>Agent assignments</h2><p>{agents.length} agents assigned</p></div></div>
          {canManage && (
            <form className="agent-assign-form" onSubmit={addAgent}>
              <div className="field-grid">
                <label className="field">Agent name<input value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Full name" required /></label>
                <label className="field">Agent email<input type="email" value={agentEmail} onChange={(event) => setAgentEmail(event.target.value)} placeholder="agent@example.gov.gh" required /></label>
                <label className="field field-wide">Zone <span className="field-optional">Optional</span><select value={agentZone} onChange={(event) => setAgentZone(event.target.value)}><option value="">Unassigned / all zones</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.zoneCode} · {zone.zoneName}</option>)}</select></label>
              </div>
              <button className="button" type="submit" disabled={pending === 'agent'}><UserPlus size={14} aria-hidden="true" /> {pending === 'agent' ? 'Assigning…' : 'Assign agent'}</button>
            </form>
          )}
          {result && <div className={`notice ${result.ok ? 'ok' : 'error'}`}>{result.message}</div>}
          {agents.length === 0 ? <div className="concession-inline-empty"><UsersRound size={16} aria-hidden="true" /> No agents assigned to this assembly.</div> : (
            <div className="agent-list">
              {agents.map((agent) => {
                const zone = zones.find((item) => item.id === agent.zoneId);
                return (
                  <div key={agent.id} className="agent-row">
                    <span className="record-avatar">{agent.agentName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</span>
                    <span><strong>{agent.agentName}</strong><small>{agent.agentEmail}{zone ? ` · ${zone.zoneCode}` : ' · All zones'}</small></span>
                    {canManage && <button type="button" className="icon-button danger" onClick={() => remove(agent.id)} disabled={pending === agent.id} aria-label={`Remove ${agent.agentName}`}><Trash2 size={14} aria-hidden="true" /></button>}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
