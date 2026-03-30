import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Tag,
  Sparkles,
  Gauge,
} from "lucide-react";

function getConfidenceColor(level: number): string {
  if (level >= 80) return "text-green-600";
  if (level >= 60) return "text-emerald-500";
  if (level >= 40) return "text-yellow-500";
  if (level >= 20) return "text-orange-500";
  return "text-red-500";
}

function getConfidenceLabel(level: number): string {
  if (level >= 80) return "Very High";
  if (level >= 60) return "High";
  if (level >= 40) return "Medium";
  if (level >= 20) return "Low";
  return "Very Low";
}

export default function TradingElements() {
  const utils = trpc.useUtils();

  const { data: elements, isLoading } = trpc.tradingElement.list.useQuery();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editElement, setEditElement] = useState<{
    id: number;
    name: string;
    description: string | null;
    confidenceLevel: number;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    confidenceLevel: 50,
  });

  const createMutation = trpc.tradingElement.create.useMutation({
    onSuccess: () => {
      toast.success("Trading element created");
      utils.tradingElement.list.invalidate();
      setIsCreateOpen(false);
      setFormData({ name: "", description: "", confidenceLevel: 50 });
    },
    onError: error => {
      toast.error(error.message || "Failed to create element");
    },
  });

  const updateMutation = trpc.tradingElement.update.useMutation({
    onSuccess: () => {
      toast.success("Trading element updated");
      utils.tradingElement.list.invalidate();
      setEditElement(null);
      setFormData({ name: "", description: "", confidenceLevel: 50 });
    },
    onError: error => {
      toast.error(error.message || "Failed to update element");
    },
  });

  const deleteMutation = trpc.tradingElement.delete.useMutation({
    onSuccess: () => {
      toast.success("Trading element deleted");
      utils.tradingElement.list.invalidate();
      setDeleteId(null);
    },
    onError: error => {
      toast.error(error.message || "Failed to delete element");
    },
  });

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      confidenceLevel: formData.confidenceLevel,
    });
  };

  const handleUpdate = () => {
    if (!editElement || !formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    updateMutation.mutate({
      id: editElement.id,
      name: formData.name.trim(),
      description: formData.description.trim() || undefined,
      confidenceLevel: formData.confidenceLevel,
    });
  };

  const openEdit = (element: {
    id: number;
    name: string;
    description: string | null;
    confidenceLevel: number;
  }) => {
    setEditElement(element);
    setFormData({
      name: element.name,
      description: element.description || "",
      confidenceLevel: element.confidenceLevel,
    });
  };

  const closeDialogs = () => {
    setIsCreateOpen(false);
    setEditElement(null);
    setFormData({ name: "", description: "", confidenceLevel: 50 });
  };

  // Suggested elements for quick creation
  const suggestedElements = [
    { name: "Gap", confidence: 70 },
    { name: "Double Top/Bottom", confidence: 75 },
    { name: "CVD Divergence", confidence: 65 },
    { name: "Support/Resistance", confidence: 60 },
    { name: "Trend Line Break", confidence: 55 },
    { name: "Volume Spike", confidence: 50 },
    { name: "Fibonacci Retracement", confidence: 60 },
    { name: "Moving Average Cross", confidence: 55 },
    { name: "RSI Divergence", confidence: 65 },
    { name: "Order Block", confidence: 70 },
  ];

  const existingNames = elements?.map(e => e.name.toLowerCase()) || [];
  const availableSuggestions = suggestedElements.filter(
    s => !existingNames.includes(s.name.toLowerCase())
  );

  const quickCreate = (name: string, confidence: number) => {
    createMutation.mutate({ name, confidenceLevel: confidence });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading">Trading Elements</h1>
          <p className="text-subtitle mt-1">
            Manage your trading opportunity tags with confidence levels
          </p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Element
        </Button>
      </div>

      {/* Quick Suggestions */}
      {availableSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-medium">Quick Add</CardTitle>
            </div>
            <CardDescription className="text-subtitle">
              Click to quickly add common trading elements with preset
              confidence levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {availableSuggestions.map(suggestion => (
                <Button
                  key={suggestion.name}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    quickCreate(suggestion.name, suggestion.confidence)
                  }
                  disabled={createMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-3 w-3" />
                  {suggestion.name}
                  <span
                    className={`text-xs ${getConfidenceColor(suggestion.confidence)}`}
                  >
                    {suggestion.confidence}%
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Elements List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Your Elements</CardTitle>
          <CardDescription className="text-subtitle">
            These elements can be assigned to trading systems. Confidence levels
            help calculate trade confidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : elements && elements.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {elements.map(element => (
                <div
                  key={element.id}
                  className="flex items-start justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="rounded-lg bg-muted p-2 shrink-0">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{element.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Gauge className="h-3 w-3 text-muted-foreground" />
                        <span
                          className={`text-sm font-medium ${getConfidenceColor(element.confidenceLevel)}`}
                        >
                          {element.confidenceLevel}%
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({getConfidenceLabel(element.confidenceLevel)})
                        </span>
                      </div>
                      {element.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {element.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(element)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(element.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Tag className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No elements yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create trading elements to categorize your strategies
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First Element
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog
        open={isCreateOpen}
        onOpenChange={open => !open && closeDialogs()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Trading Element</DialogTitle>
            <DialogDescription>
              Add a new trading opportunity element with a confidence level
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Name *</Label>
              <Input
                id="create-name"
                placeholder="e.g., Gap, Double Top, CVD Divergence"
                value={formData.name}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Confidence Level</Label>
                <span
                  className={`text-sm font-medium ${getConfidenceColor(formData.confidenceLevel)}`}
                >
                  {formData.confidenceLevel}% -{" "}
                  {getConfidenceLabel(formData.confidenceLevel)}
                </span>
              </div>
              <Slider
                value={[formData.confidenceLevel]}
                onValueChange={value =>
                  setFormData({ ...formData, confidenceLevel: value[0] })
                }
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                How confident are you when this element appears? (0-100)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-description">Description (Optional)</Label>
              <Textarea
                id="create-description"
                placeholder="Describe when this element signals a trading opportunity..."
                rows={3}
                value={formData.description}
                onChange={e =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editElement !== null}
        onOpenChange={open => !open && closeDialogs()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Trading Element</DialogTitle>
            <DialogDescription>
              Update the element details and confidence level
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Confidence Level</Label>
                <span
                  className={`text-sm font-medium ${getConfidenceColor(formData.confidenceLevel)}`}
                >
                  {formData.confidenceLevel}% -{" "}
                  {getConfidenceLabel(formData.confidenceLevel)}
                </span>
              </div>
              <Slider
                value={[formData.confidenceLevel]}
                onValueChange={value =>
                  setFormData({ ...formData, confidenceLevel: value[0] })
                }
                min={0}
                max={100}
                step={5}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description (Optional)</Label>
              <Textarea
                id="edit-description"
                rows={3}
                value={formData.description}
                onChange={e =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Element</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trading element? It will be
              removed from all trading systems.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteId && deleteMutation.mutate({ id: deleteId })
              }
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
