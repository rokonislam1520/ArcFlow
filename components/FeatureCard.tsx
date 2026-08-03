interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  href: string;
}

export function FeatureCard({ icon, title, description, href }: FeatureCardProps) {
  return (
    <a href={href} className="glass p-6 group cursor-pointer transition-all duration-300 hover:scale-[1.02]">
      <div className="text-3xl mb-4">{icon}</div>
      <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-arc-400 transition-colors">{title}</h3>
      <p className="text-sm text-slate-400 leading-relaxed">{description}</p>
    </a>
  );
}
