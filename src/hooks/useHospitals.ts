import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Hospital {
  hospital_code: string;
  name: string;
  homepage: string;
}

export interface HospitalVersion {
  id: number;
  hospital_code: string;
  version: string;
  queries: string[];
  is_active: number;
}

export const useHospitals = () => {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [versions, setVersions] = useState<HospitalVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHospitals = async () => {
      try {
        const { data: hospData, error: hospErr } = await supabase
          .from('hospitals')
          .select('hospital_code, name, homepage')
          .order('hospital_code', { ascending: true });
          
        if (hospErr) throw hospErr;
        setHospitals(hospData || []);
      } catch (err) {
        console.error("Error fetching hospitals", err);
      }
    };
    
    fetchHospitals();
  }, []);

  const fetchVersionsForHospital = async (hospitalCode: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hospital_config_versions')
        .select('id, hospital_code, version, queries, is_active')
        .eq('hospital_code', hospitalCode)
        .order('id', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
      return data || [];
    } catch (err) {
      console.error("Error fetching versions", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return {
    hospitals,
    versions,
    loading,
    fetchVersionsForHospital
  };
};
