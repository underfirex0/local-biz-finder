
import React, { useState, useMemo } from 'react';
import { SearchParams } from '../types';

interface SearchFormProps {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

const MOROCCAN_CITIES = [
  "Casablanca", "Rabat", "Fes", "Marrakesh", "Tangier", "Agadir", "Meknes", 
  "Oujda", "Kenitra", "Tetouan", "Temara", "Safi", "Sale", "Mohammedia", 
  "Beni Mellal", "El Jadida", "Taza", "Nador", "Settat", "Larache", 
  "Ksar El Kebir", "Khemisset", "Guelmim", "Berrechid", "Wad Zem", 
  "Fquih Ben Salah", "Taourirt", "Berkane", "Sidi Slimane", "Errachidia", 
  "Sidi Kacem", "Khenifra", "Tifelt", "Essaouira", "Taroudant", "Ouarzazate",
  "Al Hoceima", "Tiznit", "Tan-Tan", "Dakhla", "Laayoune"
].sort();

export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading }) => {
  const [service, setService] = useState('');
  const [city, setCity] = useState('');
  const [count, setCount] = useState(40);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (service && city) {
      onSearch({ service, city, count });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-md border border-slate-200">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">Service / Business Type</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-slate-400">
              <i className="fas fa-briefcase"></i>
            </span>
            <input
              type="text"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="e.g. Menuiserie, Café, Web Agency"
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">Moroccan City</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-slate-400">
              <i className="fas fa-location-dot"></i>
            </span>
            <input
              list="moroccan-cities"
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Search city..."
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
            <datalist id="moroccan-cities">
              {MOROCCAN_CITIES.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700 block">Lead Count</label>
          <div className="relative">
            <span className="absolute left-3 top-3 text-slate-400">
              <i className="fas fa-list-ol"></i>
            </span>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Math.min(200, Math.max(1, parseInt(e.target.value) || 0)))}
              min="1"
              max="200"
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              required
            />
          </div>
        </div>
      </div>
      <button
        type="submit"
        disabled={isLoading}
        className={`mt-6 w-full py-3 px-6 rounded-lg font-bold text-white transition-all flex items-center justify-center gap-2 ${
          isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-200'
        }`}
      >
        {isLoading ? (
          <>
            <i className="fas fa-spinner animate-spin"></i> Scrapping Moroccan Market...
          </>
        ) : (
          <>
            <i className="fas fa-magnifying-glass-location"></i> Find {count} Leads in {city || 'Morocco'}
          </>
        )}
      </button>
    </form>
  );
};
