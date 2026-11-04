import { PropertyDirectory, type PropertyRecord } from '@/components/property-directory';
import { idarmsGet } from '@/lib/api';

export default async function PropertiesPage() {
  const payload = await idarmsGet<{ data: PropertyRecord[] }>('properties', '/properties');
  return <PropertyDirectory properties={payload?.data ?? []} />;
}
