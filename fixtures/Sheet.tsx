// A component sheet: every key of a component's first two variants as a grid (plus a
// disabled row), rendered with the project's real components.
import { Component, type ReactNode } from "react"
import { PlusIcon } from "lucide-react"
import { AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Tabs, TabsTrigger } from "@/components/ui/tabs"
import sheets from "./sheets.json"

type Entry = { cva: string; export: string; variants: Record<string, string[]>; defaults: Record<string, string> }
type Props = Record<string, unknown>

const modules = import.meta.glob("../src/components/ui/*.tsx", { eager: true }) as Record<string, Record<string, (p: Props) => ReactNode>>

// Components that need context or children to make sense.
const fixtures: Record<string, (C: (p: Props) => ReactNode, props: Props, label: string) => ReactNode> = {
  TabsList: (C, props) => (
    <Tabs defaultValue="a">
      <C {...props}>
        <TabsTrigger value="a">Active</TabsTrigger>
        <TabsTrigger value="b">Tab</TabsTrigger>
      </C>
    </Tabs>
  ),
  Alert: (C, props) => (
    <C {...props}>
      <AlertTitle>Heads up</AlertTitle>
      <AlertDescription>Something worth knowing.</AlertDescription>
    </C>
  ),
  ButtonGroup: (C, props) => (
    <C {...props}>
      <Button variant="outline">One</Button>
      <Button variant="outline">Two</Button>
    </C>
  ),
}

class Cell extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) {
    return { error: e.message }
  }
  render() {
    return this.state.error ? <span className="text-xs text-destructive">Needs context</span> : this.props.children
  }
}

export function Sheet({ component }: { component: string }) {
  const entries = (sheets as Record<string, Entry[]>)[component] ?? []
  const mod = modules[`../src/components/ui/${component}.tsx`] ?? {}
  return (
    <div className="flex flex-col gap-10 p-6">
      {entries.map((e) => {
        const C = mod[e.export]
        if (!C) return null
        const [rowDim, colDim] = Object.keys(e.variants)
        const rows = rowDim ? e.variants[rowDim] : [""]
        const cols = colDim ? e.variants[colDim] : [""]
        // Icon sizes get an icon, not a label.
        const plain = (C: (p: Props) => ReactNode, p: Props, label: string) =>
          <C {...p}>{Object.values(p).some((v) => typeof v === "string" && v.startsWith("icon")) ? <PlusIcon /> : label}</C>
        const render = (props: Props) => (fixtures[e.export] ?? plain)(C, props, e.export)
        return (
          <section key={e.cva} className="flex flex-col gap-3">
            <h2 className="text-xs text-muted-foreground">
              {e.export} · {[rowDim, colDim].filter(Boolean).join(" × ")}
            </h2>
            <div className="grid items-center gap-x-6 gap-y-4" style={{ gridTemplateColumns: `7rem repeat(${cols.length}, max-content)` }}>
              <span />
              {cols.map((c) => (
                <span key={c} className="text-xs text-muted-foreground">
                  {c}
                  {c && e.defaults[colDim] === c ? " ·" : ""}
                </span>
              ))}
              {[...rows, "disabled"].map((r) => (
                <div key={r} className="contents">
                  <span className="text-xs text-muted-foreground">
                    {r}
                    {r && e.defaults[rowDim] === r ? " ·" : ""}
                  </span>
                  {cols.map((c) => {
                    const props: Props = r === "disabled" ? { disabled: true } : rowDim ? { [rowDim]: r } : {}
                    if (colDim && c) props[colDim] = c
                    return (
                      <div key={c}>
                        <Cell>{render(props)}</Cell>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
