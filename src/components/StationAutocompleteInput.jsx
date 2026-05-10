import { forwardRef, useMemo, useState } from "react";

const StationAutocompleteInput = forwardRef(function StationAutocompleteInput(
  {
    value,
    onChange,
    onBlur,
    onKeyDown,
    onCompositionStart,
    onCompositionEnd,
    stations = [],
    className = "",
    ...props
  },
  ref
) {
  const [isComposing, setIsComposing] = useState(false);
  const [compositionTick, setCompositionTick] = useState(0);

  const suggestion = useMemo(() => {
    if (!value || isComposing || props.readOnly || props.disabled) return "";
    const matches = stations.filter((station) => station.startsWith(value));
    return matches.length === 1 ? matches[0] : "";
  }, [compositionTick, isComposing, props.disabled, props.readOnly, stations, value]);


  const commitSuggestion = () => {
    if (!isComposing && suggestion && suggestion !== value) {
      onChange?.({ target: { name: props.name, value: suggestion } });
    }
  };

  return (
    <div className="station-autocomplete-input">
      <input
        ref={ref}
        value={value}
        onChange={onChange}
        onCompositionStart={(event) => {
          setIsComposing(true);
          onCompositionStart?.(event);
        }}
        onCompositionEnd={(event) => {
          setIsComposing(false);
          onCompositionEnd?.(event);
          requestAnimationFrame(() => {
            setCompositionTick((tick) => tick + 1);
          });
        }}
        onBlur={(event) => {
          commitSuggestion();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !isComposing) {
            commitSuggestion();
          }
          onKeyDown?.(event);
        }}
        className={className}
        {...props}
      />
    </div>
  );
});

export default StationAutocompleteInput;
