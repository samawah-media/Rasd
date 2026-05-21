"use client";

import React, { useState, useEffect } from "react";
import { Database, Sparkles, UserCheck, FileCheck2 } from "lucide-react";

export default function AnimatedWorkflowHero() {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 4);
    }, 2500); // Transition steps every 2.5 seconds (full cycle of 4 steps in 10s)
    return () => clearInterval(interval);
  }, []);

  const steps = [
    {
      title: "سحب البيانات تلقائياً",
      subtitle: "Ingestion",
      desc: "جمع لحظي للتغريدات والأخبار من المصادر المختلفة بمعدل تأخير يقارب الصفر.",
      icon: Database,
      color: "from-blue-500 to-indigo-600",
      accent: "text-blue-500 bg-blue-500/10",
    },
    {
      title: "التصنيف بالذكاء الاصطناعي",
      subtitle: "AI Classification",
      desc: "تحليل ذكي فوري للمشاعر، استخراج الكلمات المفتاحية، وتحديد الأهمية ونسبة الصلة.",
      icon: Sparkles,
      color: "from-purple-500 to-pink-600",
      accent: "text-purple-500 bg-purple-500/10",
    },
    {
      title: "التدقيق والتنقيح البشري",
      subtitle: "Human Review",
      desc: "مراجعة وضبط المحتوى عبر لوحة تحكم ذكية لتأكيد الحذف أو الاعتماد.",
      icon: UserCheck,
      color: "from-amber-500 to-orange-600",
      accent: "text-amber-500 bg-amber-500/10",
    },
    {
      title: "توليد التقرير النهائي",
      subtitle: "Report Generation",
      desc: "تصدير فوري لتقارير تنفيذية فاخرة ومتاحة للمشاركة الفورية مع متخذي القرار.",
      icon: FileCheck2,
      color: "from-emerald-500 to-teal-600",
      accent: "text-emerald-500 bg-emerald-500/10",
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto bg-white rounded-3xl border border-[var(--color-border)] p-6 md:p-8 shadow-premium relative overflow-hidden">
      {/* Background soft grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[radial-gradient(#2383E2_1px,transparent_1px)] [background-size:16px_16px]" />

      <div className="relative z-10 flex flex-col items-center">
        <span className="text-[10px] uppercase font-bold tracking-widest text-[#2383E2] bg-[#2383E2]/10 px-3 py-1 rounded-full mb-3">
          دورة حياة معالجة البيانات الفورية
        </span>
        <h2 className="text-xl md:text-2xl font-extrabold text-[var(--color-text-title)] text-center mb-10">
          كيف تعمل منصة الرصد الإعلامي الذكية؟
        </h2>

        {/* Workflow Timeline Map */}
        <div className="w-full flex flex-col md:flex-row items-center justify-between gap-6 relative md:px-10">
          
          {/* Connecting Line (Desktop) */}
          <div className="absolute top-[40px] left-[10%] right-[10%] h-[3px] bg-stone-100 hidden md:block z-0 overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-purple-500 via-amber-500 to-emerald-500 transition-all duration-1000 ease-out-sine"
              style={{ width: `${((activeStep + 1) / 4) * 100}%` }}
            />
          </div>

          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = idx < activeStep;
            const isActive = idx === activeStep;
            return (
              <div 
                key={idx} 
                className="flex-1 flex flex-col items-center text-center z-10 w-full md:w-auto transition-all duration-500"
              >
                {/* Node Circle */}
                <div className="relative mb-4">
                  {/* Pulse Effect for Active Node */}
                  {isActive && (
                    <span className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-[#2383E2]/20 to-[#00C853]/20 animate-ping opacity-75" />
                  )}

                  <div 
                    className={`w-20 h-20 rounded-2xl flex items-center justify-center border-2 transition-all duration-500 shadow-md ${
                      isActive 
                        ? `bg-gradient-to-br ${step.color} text-white border-transparent scale-110 shadow-lg` 
                        : isCompleted
                          ? "bg-[#eaf6ed] text-[#00C853] border-[#00C853]"
                          : "bg-white text-stone-400 border-[var(--color-border)]"
                    }`}
                  >
                    {isCompleted ? (
                      <svg 
                        className="w-8 h-8 stroke-current transition-all duration-500" 
                        fill="none" 
                        viewBox="0 0 24 24"
                        strokeWidth="3.5"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          d="M4.5 12.75l6 6 9-13.5" 
                          className="animate-draw-checkmark" 
                          style={{
                            strokeDasharray: 30,
                            strokeDashoffset: 0,
                          }}
                        />
                      </svg>
                    ) : (
                      <Icon size={32} className={isActive ? "animate-pulse" : ""} />
                    )}
                  </div>

                  {/* Desktop Step Index Bubble */}
                  <div className={`absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-extrabold border transition-colors shadow-sm ${
                    isActive
                      ? "bg-white text-[var(--color-text-title)] border-stone-200"
                      : isCompleted
                        ? "bg-[#00C853] text-white border-transparent"
                        : "bg-stone-50 text-stone-400 border-stone-200"
                  }`}>
                    {idx + 1}
                  </div>
                </div>

                {/* Text Content */}
                <div className={`transition-all duration-300 max-w-[200px] ${isActive ? "opacity-100" : "opacity-60"}`}>
                  <h3 className="text-sm font-bold text-[var(--color-text-title)]">{step.title}</h3>
                  <span className="text-[9px] font-extrabold uppercase tracking-wide opacity-80 block mt-0.5">{step.subtitle}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Informational Text display panel at bottom */}
        <div className="w-full mt-10 p-5 rounded-2xl bg-[var(--color-bg-main)] border border-[var(--color-border)] transition-all duration-500">
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${steps[activeStep].accent}`}>
              {React.createElement(steps[activeStep].icon, { size: 22 })}
            </div>
            <div className="flex-1 text-right">
              <h4 className="text-sm font-extrabold text-[var(--color-text-title)] flex items-center gap-2">
                <span>{steps[activeStep].title}</span>
                <span className="text-[10px] text-stone-400">({steps[activeStep].subtitle})</span>
              </h4>
              <p className="text-xs text-[var(--color-text-body)] mt-2 leading-relaxed font-medium">
                {steps[activeStep].desc}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Custom Styles */}
      <style jsx global>{`
        @keyframes drawCheckmark {
          from {
            stroke-dashoffset: 30;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        .animate-draw-checkmark {
          animation: drawCheckmark 0.6s ease-in-out forwards;
        }
      `}</style>
    </div>
  );
}
