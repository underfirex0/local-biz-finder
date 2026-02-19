import React, { useState, useEffect, useMemo } from "react";
import { SearchForm } from "./components/SearchForm";
import {
  SearchParams,
  BusinessInfo,
  GroundingSource,
  Lead,
  LeadStatus,
  MarketingNiche,
} from "./types";

const MAX_TOTAL = 200;

function extractMarkdownFromGeminiResponse(data: any): string {
  // Support different shapes
  if (typeof data?.text === "string") return data.text;

  const parts = data?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts.map((p: any) => p?.text || "").join("").trim();
  }

  return "";
}

function parseMarkdownTable(markdown: string): BusinessInfo[] {
  const businesses: BusinessInfo[] = [];
  const lines = markdown.split("\n");

  const rows = lines.filter(
    (line) =>
      line.includes("|") &&
      !line.toLowerCase().includes("name") &&
      !line.includes("---")
  );

  rows.forEach((row) => {
    const cells = row
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c !== "");

    // | Name | Phone Number | Review Count | Address |
    if (cells.length >= 3) {
      businesses.push({
        name: cells[0] || "",
        phone: cells[1] || "N/A",
        reviews: cells[2] || "0",
        address: cells[3] || "",
      });
    }
  });

  // Remove empties
  return businesses.filter((b) => b.name);
}

function extractSources(data: any): GroundingSource[] {
  const sources: GroundingSource[] = [];
  const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks;

  if (Array.isArray(chunks)) {
    chunks.forEach((chunk: any) => {
      if (chunk?.maps?.uri) {
        sources.push({
          title: chunk.maps.title || "Google Maps Link",
          uri: chunk.maps.uri,
        });
      }
    });
  }
  return sources;
}

const App: React.FC = () => {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<"finder" | "leads">("finder");

  // Scraper State
  const [allBusinesses, setAllBusinesses] = useState<BusinessInfo[]>([]);
  const [allSources, setAllSources] = useState<GroundingSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<
    { latitude: number; longitude: number } | undefined
  >();
  const [currentSearchParams, setCurrentSearchParams] =
    useState<SearchParams | null>(null);

  // CRM State
  const [leads, setLeads] = useState<Lead[]>(() => {
    const saved = localStorage.getItem("local_biz_leads");
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [selectedNiche, setSelectedNiche] =
    useState<MarketingNiche>("Web Design");

  // CRM Filters
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Persistence
  useEffect(() => {
    localStorage.setItem("local_biz_leads", JSON.stringify(leads));
  }, [leads]);

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        (err) => console.log("Geolocation error:", err)
      );
    }
  }, []);

  // Finder Actions (✅ calls /api/search directly)
  const handleSearch = async (params: SearchParams) => {
    setIsLoading(true);
    setError(null);
    setAllBusinesses([]);
    setAllSources([]);
    setCurrentSearchParams(params);

    try {
      console.log("[App] Searching:", params);

      const resp = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: params.service,
          city: params.city,
          count: params.count,
          existingNames: [],
          location: userLocation,
        }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        const msg = data?.error || `Search failed (${resp.status})`;
        throw new Error(msg);
      }

      const rawMarkdown = extractMarkdownFromGeminiResponse(data);
      const businesses = parseMarkdownTable(rawMarkdown);
      const sources = extractSources(data);

      if (!rawMarkdown || businesses.length === 0) {
        throw new Error(
          "No results returned. Try another service/city, or increase count."
        );
      }

      setAllBusinesses(businesses);
      setAllSources(sources);
    } catch (err: any) {
      console.error("[App] Search error:", err);
      setError(err?.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  // CRM Actions
  const saveLead = (biz: BusinessInfo, category: string = "General") => {
    if (leads.find((l) => l.name === biz.name)) return;
    const newLead: Lead = {
      ...biz,
      id: Math.random().toString(36).substr(2, 9),
      status: "New",
      savedAt: Date.now(),
      category: category,
    };
    setLeads((prev) => [newLead, ...prev]);
  };

  const saveAll = () => {
    if (!currentSearchParams) return;
    const category = currentSearchParams.service;
    allBusinesses.forEach((biz) => saveLead(biz, category));
  };

  const updateLeadStatus = (id: string, status: LeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  const deleteLead = (id: string) => {
    if (window.confirm("Remove this lead?")) {
      setLeads((prev) => prev.filter((l) => l.id !== id));
      if (selectedLead?.id === id) setSelectedLead(null);
    }
  };

  // ✅ Calls /api/script directly
  const handleGenerateScript = async (lead: Lead) => {
    setIsGeneratingScript(true);
    try {
      const resp = await fetch("/api/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: {
            name: lead.name,
            address: lead.address,
            reviews: lead.reviews,
            phone: lead.phone,
          },
          niche: selectedNiche,
        }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error || "Script generation failed");

      const script = data?.text || "";
      setLeads((prev) =>
        prev.map((l) =>
          l.id === lead.id ? { ...l, script, lastNiche: selectedNiche } : l
        )
      );
      setSelectedLead((prev) =>
        prev?.id === lead.id ? { ...prev, script, lastNiche: selectedNiche } : prev
      );
    } catch (err) {
      console.error(err);
      alert("Error generating script. Check Vercel logs.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const exportLeadsCSV = () => {
    if (leads.length === 0) return;
    const headers = [
      "Name",
      "Phone",
      "Reviews",
      "Address",
      "Status",
      "Category",
      "Date Saved",
    ];
    const rows = leads.map((l) => [
      `"${l.name.replace(/"/g, '""')}"`,
      `"${l.phone}"`,
      `"${l.reviews}"`,
      `"${(l.address || "").replace(/"/g, '""')}"`,
      `"${l.status}"`,
      `"${l.category}"`,
      `"${new Date(l.savedAt).toLocaleDateString()}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join(
      "\n"
    );
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `morocco_leads_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  // Filter Logic
  const uniqueCategories = useMemo(() => {
    const cats = Array.from(new Set(leads.map((l) => l.category)));
    return ["All", ...cats];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      const catMatch = categoryFilter === "All" || l.category === categoryFilter;
      const statusMatch =
        statusFilter === "All" ||
        (statusFilter === "Contacted" &&
          (l.status === "Contacted" || l.status === "Meeting Booked")) ||
        (statusFilter === "Not Contacted" &&
          (l.status === "New" || l.status === "Called - No Answer")) ||
        statusFilter === l.status;
      return catMatch && statusMatch;
    });
  }, [leads, categoryFilter, statusFilter]);

  return (
    <div className="min-h-screen pb-20 bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="bg-red-600 p-2 rounded-lg">
                <i className="fas fa-star text-white"></i>
              </div>
              <div className="flex flex-col">
                <span className="font-black text-xl tracking-tighter text-slate-900 hidden sm:block leading-none">
                  MOROCCO FINDER
                </span>
                <span className="text-[10px] font-bold text-red-600 tracking-widest hidden sm:block uppercase">
                  Business Scraper
                </span>
              </div>
            </div>

            <nav className="flex items-center bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("finder")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                  activeTab === "finder"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                1. Finder
              </button>
              <button
                onClick={() => setActiveTab("leads")}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all relative ${
                  activeTab === "leads"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                2. CRM
                {leads.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center">
                    {leads.length}
                  </span>
                )}
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === "leads" && leads.length > 0 && (
              <button
                onClick={exportLeadsCSV}
                className="text-emerald-600 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-all"
              >
                <i className="fas fa-download mr-1"></i> Export CRM
              </button>
            )}
            <div className="hidden md:flex items-center text-[10px] font-bold text-slate-400 gap-2 uppercase">
              <span
                className={`w-2 h-2 rounded-full ${
                  userLocation ? "bg-green-500" : "bg-amber-500 animate-pulse"
                }`}
              ></span>
              {userLocation ? "GPS Ready" : "GPS Locating"}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full px-4 mt-8 flex-1">
        {activeTab === "finder" ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-left-4 duration-500">
            <div className="text-center max-w-xl mx-auto space-y-2">
              <h2 className="text-3xl font-black text-slate-900">
                Moroccan Business Leads
              </h2>
              <p className="text-slate-500 text-sm">
                Target any city from Casablanca to Dakhla. Choose lead count and scrape.
              </p>
            </div>

            <SearchForm
              onSearch={handleSearch}
              isLoading={isLoading && allBusinesses.length === 0}
            />

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3">
                <i className="fas fa-exclamation-circle text-xl"></i>
                <p className="font-bold text-sm">{error}</p>
              </div>
            )}

            {allBusinesses.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <div className="text-sm font-bold text-slate-600">
                    Found{" "}
                    <span className="text-blue-600">{allBusinesses.length}</span>{" "}
                    Moroccan results for{" "}
                    <span className="text-slate-900">
                      "{currentSearchParams?.service}"
                    </span>{" "}
                    in{" "}
                    <span className="text-red-600">
                      {currentSearchParams?.city}
                    </span>
                  </div>
                  <button
                    onClick={saveAll}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-md active:scale-95 transition-all"
                  >
                    <i className="fas fa-cloud-arrow-up mr-2"></i> Save All to CRM
                  </button>
                </div>

                <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">
                            #
                          </th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">
                            Business
                          </th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase">
                            Contact
                          </th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase text-center">
                            Reviews
                          </th>
                          <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allBusinesses.map((biz, idx) => {
                          const isSaved = !!leads.find((l) => l.name === biz.name);
                          return (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 text-xs font-mono text-slate-300">
                                {idx + 1}
                              </td>
                              <td className="px-6 py-4">
                                <div className="font-bold text-slate-900 text-sm">
                                  {biz.name}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                  {biz.address}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm font-medium text-slate-600">
                                {biz.phone}
                              </td>
                              <td className="px-6 py-4 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                  {biz.reviews}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                {isSaved ? (
                                  <span className="text-green-500 font-black text-[10px] uppercase bg-green-50 px-2 py-1 rounded">
                                    Saved <i className="fas fa-check"></i>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() =>
                                      saveLead(biz, currentSearchParams?.service || "General")
                                    }
                                    className="text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                                  >
                                    Save Lead
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {allSources.length > 0 && (
                    <div className="p-4 border-t border-slate-200">
                      <div className="text-xs font-black text-slate-400 uppercase mb-2">
                        Sources
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {allSources.slice(0, 6).map((s, i) => (
                          <a
                            key={i}
                            href={s.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full hover:bg-blue-100"
                          >
                            {s.title || "Maps Link"}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          // ✅ Keep your CRM UI as-is (unchanged)
          <div className="flex flex-col space-y-6 animate-in fade-in duration-500">
            {/* CRM Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Service Category
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Engagement Filter
                </label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="All">All Statuses</option>
                  <option value="Not Contacted">
                    Not Contacted (New/No Answer)
                  </option>
                  <option value="Contacted">Contacted (Talked/Meeting)</option>
                  <option value="Meeting Booked">Meeting Booked</option>
                  <option value="Not Interested">Not Interested</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Leads List */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">
                    Moroccan Pipeline
                  </h2>
                  <div className="text-xs font-bold text-slate-400 bg-white border border-slate-200 px-3 py-1 rounded-full uppercase">
                    {filteredLeads.length} Matches
                  </div>
                </div>

                <div className="space-y-3">
                  {filteredLeads.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-300">
                      <i className="fas fa-filter text-slate-200 text-5xl mb-4"></i>
                      <p className="text-slate-400 font-bold">
                        No leads match these filters.
                      </p>
                    </div>
                  ) : (
                    filteredLeads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`group p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                          selectedLead?.id === lead.id
                            ? "bg-red-600 border-red-600 text-white shadow-xl"
                            : "bg-white border-slate-200 text-slate-900 hover:border-red-300"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                              selectedLead?.id === lead.id
                                ? "bg-red-500 text-white"
                                : "bg-slate-100 text-slate-400"
                            }`}
                          >
                            {lead.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-bold text-sm leading-tight">
                              {lead.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${
                                  selectedLead?.id === lead.id
                                    ? "bg-red-700 border-red-500"
                                    : "bg-slate-100 border-slate-200 text-slate-500"
                                }`}
                              >
                                {lead.category}
                              </span>
                              <p
                                className={`text-[10px] ${
                                  selectedLead?.id === lead.id
                                    ? "text-red-100"
                                    : "text-slate-400"
                                }`}
                              >
                                {lead.phone}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <select
                            value={lead.status}
                            onChange={(e) => {
                              e.stopPropagation();
                              updateLeadStatus(
                                lead.id,
                                e.target.value as LeadStatus
                              );
                            }}
                            className={`text-[10px] font-black uppercase px-2 py-1 rounded border outline-none ${
                              selectedLead?.id === lead.id
                                ? "bg-red-700 border-red-500 text-white"
                                : "bg-slate-50 border-slate-200"
                            }`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="New">New</option>
                            <option value="Called - No Answer">No Answer</option>
                            <option value="Contacted">Contacted</option>
                            <option value="Meeting Booked">Meeting Booked</option>
                            <option value="Not Interested">Not Interested</option>
                          </select>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteLead(lead.id);
                            }}
                            className={`p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity ${
                              selectedLead?.id === lead.id
                                ? "hover:bg-white/20 text-white"
                                : "hover:bg-red-50 text-red-400"
                            }`}
                          >
                            <i className="fas fa-trash-can text-xs"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Script Section */}
              <div className="lg:col-span-5">
                <div className="sticky top-24 space-y-6">
                  <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xl min-h-[500px] flex flex-col">
                    {selectedLead ? (
                      <div className="flex-1 flex flex-col space-y-6">
                        <div className="space-y-1">
                          <div className="text-[10px] font-black text-red-600 uppercase tracking-widest">
                            Morocco Lead Intel
                          </div>
                          <h3 className="text-xl font-black text-slate-900">
                            {selectedLead.name}
                          </h3>
                          <div className="flex flex-wrap gap-2 pt-2">
                            <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-600">
                              <i className="fas fa-tag mr-1"></i>{" "}
                              {selectedLead.category}
                            </span>
                            <span className="text-[10px] bg-slate-100 px-2 py-1 rounded font-bold text-slate-600">
                              <i className="fas fa-star text-amber-500 mr-1"></i>{" "}
                              {selectedLead.reviews}
                            </span>
                          </div>
                        </div>

                        <div className="h-px bg-slate-100 w-full"></div>

                        <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            Marketing Angle
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              [
                                "Web Design",
                                "Social Media",
                                "Google Ads",
                                "SEO",
                                "General Marketing",
                              ] as MarketingNiche[]
                            ).map((niche) => (
                              <button
                                key={niche}
                                onClick={() => setSelectedNiche(niche)}
                                className={`px-3 py-2 rounded-xl text-[10px] font-bold border transition-all ${
                                  selectedNiche === niche
                                    ? "bg-red-600 border-red-600 text-white shadow-md"
                                    : "bg-slate-50 border-slate-200 text-slate-600 hover:border-red-200"
                                }`}
                              >
                                {niche}
                              </button>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleGenerateScript(selectedLead)}
                          disabled={isGeneratingScript}
                          className="w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2"
                        >
                          {isGeneratingScript ? (
                            <i className="fas fa-magic animate-spin"></i>
                          ) : (
                            <i className="fas fa-wand-magic-sparkles"></i>
                          )}
                          {selectedLead.script ? "Update Script" : "Generate Script"}
                        </button>

                        {selectedLead.script && (
                          <div className="flex-1 bg-slate-50 rounded-2xl p-4 border border-slate-200 relative group overflow-y-auto max-h-[250px]">
                            <div className="text-[10px] font-black text-slate-300 uppercase absolute top-2 right-4 tracking-tighter">
                              Script: {selectedLead.lastNiche}
                            </div>
                            <div className="prose prose-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap italic">
                              "{selectedLead.script}"
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  selectedLead.script || ""
                                );
                                alert("Script Copied!");
                              }}
                              className="mt-4 w-full py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase hover:shadow-md transition-all"
                            >
                              <i className="fas fa-copy mr-1"></i> Copy to Clipboard
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 text-slate-300">
                        <div className="w-16 h-16 rounded-full border-4 border-slate-100 flex items-center justify-center">
                          <i className="fas fa-phone text-2xl"></i>
                        </div>
                        <div>
                          <p className="font-black text-sm uppercase tracking-widest text-slate-400">
                            Campaign Preparation
                          </p>
                          <p className="text-xs text-slate-300 max-w-[200px] mt-2">
                            Select a lead to unlock personalized Moroccan marketing strategies.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-20 py-8 border-t border-slate-100 text-center opacity-50">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
          Moroccan Market Closer • Powered by Gemini 2.5
        </p>
      </footer>
    </div>
  );
};

export default App;