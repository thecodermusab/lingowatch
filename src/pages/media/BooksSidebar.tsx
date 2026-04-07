import { Search } from "lucide-react";

interface RangeSliderProps {
  label: string;
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  marks: number[];
  step: number;
}

function RangeSlider({ label, min, max, value, onChange, marks, step }: RangeSliderProps) {
  return (
    <section className="px-6 py-5">
      <p className="mb-4 text-[12px] text-white/50">{label}</p>
      <div className="relative h-1 bg-[#3e3e3e] rounded-full">
        <div
          className="absolute h-full bg-[#a855f7] rounded-full"
          style={{
            left: `${((value[0] - min) / (max - min)) * 100}%`,
            right: `${100 - ((value[1] - min) / (max - min)) * 100}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[0]}
          onChange={(e) => {
            const nextValue = parseInt(e.target.value, 10);
            if (nextValue <= value[1]) onChange([nextValue, value[1]]);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value[1]}
          onChange={(e) => {
            const nextValue = parseInt(e.target.value, 10);
            if (nextValue >= value[0]) onChange([value[0], nextValue]);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          className="pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]"
          style={{ left: `${((value[0] - min) / (max - min)) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute top-1/2 h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#a855f7]"
          style={{ left: `${((value[1] - min) / (max - min)) * 100}%` }}
        />
      </div>
      <div className="mt-3 flex justify-between text-[12px] text-white">
        {marks.map((mark, i) => (
          <span key={i}>{mark}</span>
        ))}
      </div>
    </section>
  );
}

export function BooksSidebar() {
  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-[#a855f7] scrollbar-track-transparent">
      {/* Search Input */}
      <div className="px-5 py-5 border-b border-[#3e3e3e]">
        <div className="relative">
          <input
            type="text"
            placeholder="Search"
            className="w-full bg-[#161616] border border-[#3e3e3e] rounded-[4px] px-3 py-1.5 text-[14px] text-white placeholder-white/40 focus:outline-none focus:border-[#a855f7] transition-colors"
          />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        </div>
      </div>

      <RangeSlider
        label="Vocabulary level"
        min={0}
        max={100000}
        step={100}
        value={[0, 100000]}
        onChange={() => {}}
        marks={[0, 400, 2500, 100000]}
      />

      <RangeSlider
        label="Number of pages"
        min={0}
        max={4000}
        step={10}
        value={[0, 4000]}
        onChange={() => {}}
        marks={[0, 4, 32, 500, 4000]}
      />
    </div>
  );
}
