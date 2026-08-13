import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Jan', myHospital: 40, competitors: 60 },
  { name: 'Feb', myHospital: 45, competitors: 58 },
  { name: 'Mar', myHospital: 55, competitors: 55 },
  { name: 'Apr', myHospital: 70, competitors: 50 },
  { name: 'May', myHospital: 75, competitors: 45 },
  { name: 'Jun', myHospital: 85, competitors: 40 },
];

const OpportunityAnalysis = () => {
  return (
    <div className="space-y-6">
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
          <h4 className="text-sm text-muted-foreground font-medium mb-2">Overall Visibility</h4>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">85%</span>
            <span className="text-sm font-medium text-green-500">+12%</span>
          </div>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm">
          <h4 className="text-sm text-muted-foreground font-medium mb-2">Keyword Opportunities</h4>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">14</span>
            <span className="text-sm font-medium text-muted-foreground">untapped</span>
          </div>
        </div>
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm bg-gradient-to-br from-primary/10 to-transparent">
          <h4 className="text-sm text-primary font-medium mb-2">AI Recommendation</h4>
          <p className="text-sm text-foreground font-medium mt-1">Focus on "LASIK recovery time" to beat top competitor.</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border p-6 rounded-xl shadow-sm h-[400px]">
        <h3 className="text-lg font-semibold mb-6 text-foreground">Competitor Benchmarking (AI Mentions)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorMine" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
              itemStyle={{ color: 'hsl(var(--foreground))' }}
            />
            <Area type="monotone" dataKey="competitors" stroke="hsl(var(--muted-foreground))" fillOpacity={1} fill="url(#colorComp)" />
            <Area type="monotone" dataKey="myHospital" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorMine)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default OpportunityAnalysis;
