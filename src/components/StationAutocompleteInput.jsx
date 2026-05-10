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

  const suggestion = useMemo(() => {
    if (!value || isComposing || props.readOnly || props.disabled) return "";
    const matches = stations.filter((station) => station.startsWith(value));
    return matches.length === 1 ? matches[0] : "";
  }, [isComposing, props.disabled, props.readOnly, stations, value]);

  const ghostSuffix = suggestion && suggestion.length > value.length ? suggestion.slice(value.length) : "";

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
      {ghostSuffix && (
        <span className="station-autocomplete-ghost">
          <span className="station-autocomplete-hidden">{value}</span>
          <span>{ghostSuffix}</span>
        </span>
      )}
    </div>
  );
});

export default StationAutocompleteInput;
