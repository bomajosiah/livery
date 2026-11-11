// The specimen Livery renders to preview a system: a few real compositions that use the
// common components together, so a change is judged on screens, not swatches.
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const invoices = [
  { id: "INV-001", client: "Northwind", status: "Paid", amount: "$250.00" },
  { id: "INV-002", client: "Acme Co.", status: "Pending", amount: "$150.00" },
  { id: "INV-003", client: "Globex", status: "Overdue", amount: "$350.00" },
]

export function App() {
  return (
    <div className="flex min-h-svh flex-col gap-6 bg-background p-6 text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="link">Link</Button>
        <Badge>Badge</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Create project</CardTitle>
            <CardDescription>Deploy your new project in one click.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Name of your project" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="notify" defaultChecked />
              <Label htmlFor="notify">Notify the team</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="terms" defaultChecked />
              <Label htmlFor="terms">Accept terms</Label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline">Cancel</Button>
            <Button>Deploy</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team</CardTitle>
            <CardDescription>Usage this month.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Tabs defaultValue="members">
              <TabsList>
                <TabsTrigger value="members">Members</TabsTrigger>
                <TabsTrigger value="billing">Billing</TabsTrigger>
              </TabsList>
              <TabsContent value="members" className="flex flex-col gap-3 pt-2">
                {["Ada Lovelace", "Alan Turing"].map((n) => (
                  <div key={n} className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback>{n.split(" ").map((p) => p[0]).join("")}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{n}</span>
                      <span className="text-xs text-muted-foreground">{n.split(" ")[0].toLowerCase()}@example.com</span>
                    </div>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="billing">Billing</TabsContent>
            </Tabs>
            <Separator />
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-sm">
                <span>Storage</span>
                <span className="text-muted-foreground">62%</span>
              </div>
              <Progress value={62} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        {["shadow-sm", "shadow-md", "shadow-lg", "shadow-xl"].map((shadow) => (
          <div key={shadow} className={`flex w-40 flex-col gap-1 rounded-lg bg-popover p-3 text-popover-foreground ${shadow}`}>
            <span className="text-sm font-medium">Menu</span>
            <span className="text-xs text-muted-foreground">{shadow}</span>
          </div>
        ))}
      </div>

      <Alert variant="destructive">
        <AlertTitle>Payment failed</AlertTitle>
        <AlertDescription>Update your card to keep your workspace active.</AlertDescription>
      </Alert>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Client</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((i) => (
            <TableRow key={i.id}>
              <TableCell className="font-medium">{i.id}</TableCell>
              <TableCell>{i.client}</TableCell>
              <TableCell>
                <Badge variant={i.status === "Overdue" ? "destructive" : i.status === "Paid" ? "secondary" : "outline"}>
                  {i.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{i.amount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default App
