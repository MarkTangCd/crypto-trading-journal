import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, Layers, Power, PowerOff, Tag, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

type TradingElement = {
  id: number;
  name: string;
  description: string | null;
};

type TradingSystem = {
  id: number;
  name: string;
  notes: string | null;
  isActive: number;
  elements: TradingElement[];
};

export default function TradingSystems() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  
  const { data: systems, isLoading } = trpc.tradingSystem.list.useQuery();
  const { data: elements } = trpc.tradingElement.list.useQuery();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSystem, setEditSystem] = useState<TradingSystem | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    notes: "",
    elementIds: [] as number[],
  });

  const createMutation = trpc.tradingSystem.create.useMutation({
    onSuccess: () => {
      toast.success("Trading system created");
      utils.tradingSystem.list.invalidate();
      utils.tradingSystem.getActive.invalidate();
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create system");
    },
  });

  const updateMutation = trpc.tradingSystem.update.useMutation({
    onSuccess: () => {
      toast.success("Trading system updated");
      utils.tradingSystem.list.invalidate();
      utils.tradingSystem.getActive.invalidate();
      setEditSystem(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update system");
    },
  });

  const deleteMutation = trpc.tradingSystem.delete.useMutation({
    onSuccess: () => {
      toast.success("Trading system deleted");
      utils.tradingSystem.list.invalidate();
      utils.tradingSystem.getActive.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      setDeleteId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete system");
    },
  });

  const activateMutation = trpc.tradingSystem.activate.useMutation({
    onSuccess: () => {
      toast.success("Trading system activated");
      utils.tradingSystem.list.invalidate();
      utils.tradingSystem.getActive.invalidate();
      utils.transaction.getFormDefaults.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to activate system");
    },
  });

  const deactivateMutation = trpc.tradingSystem.deactivate.useMutation({
    onSuccess: () => {
      toast.success("Trading system deactivated");
      utils.tradingSystem.list.invalidate();
      utils.tradingSystem.getActive.invalidate();
      utils.transaction.getFormDefaults.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to deactivate system");
    },
  });

  const resetForm = () => {
    setFormData({ name: "", notes: "", elementIds: [] });
  };

  const handleCreate = () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    createMutation.mutate({
      name: formData.name.trim(),
      notes: formData.notes.trim() || undefined,
      elementIds: formData.elementIds,
    });
  };

  const handleUpdate = () => {
    if (!editSystem || !formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }
    updateMutation.mutate({
      id: editSystem.id,
      name: formData.name.trim(),
      notes: formData.notes.trim() || undefined,
      elementIds: formData.elementIds,
    });
  };

  const openEdit = (system: TradingSystem) => {
    setEditSystem(system);
    setFormData({
      name: system.name,
      notes: system.notes || "",
      elementIds: system.elements.map(e => e.id),
    });
  };

  const closeDialogs = () => {
    setIsCreateOpen(false);
    setEditSystem(null);
    resetForm();
  };

  const toggleElement = (elementId: number) => {
    setFormData(prev => ({
      ...prev,
      elementIds: prev.elementIds.includes(elementId)
        ? prev.elementIds.filter(id => id !== elementId)
        : [...prev.elementIds, elementId],
    }));
  };

  const activeSystem = systems?.find(s => s.isActive === 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-heading">Trading Systems</h1>
          <p className="text-subtitle mt-1">Manage your trading strategies</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New System
        </Button>
      </div>

      {/* Active System Banner */}
      {activeSystem && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-green-100 p-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Currently Active</p>
                  <p className="font-semibold">{activeSystem.name}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {activeSystem.elements.slice(0, 3).map(el => (
                  <Badge key={el.id} variant="secondary" className="text-xs">
                    {el.name}
                  </Badge>
                ))}
                {activeSystem.elements.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{activeSystem.elements.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Elements Warning */}
      {elements && elements.length === 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-amber-100 p-2">
                <Tag className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium">No trading elements yet</p>
                <p className="text-sm text-muted-foreground">
                  Create trading elements first to assign them to your systems
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setLocation("/trading-elements")}>
                Create Elements
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Systems List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Your Systems</CardTitle>
          <CardDescription className="text-subtitle">
            Activate a system to automatically bind new trades to it
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : systems && systems.length > 0 ? (
            <div className="space-y-4">
              {systems.map((system) => (
                <div
                  key={system.id}
                  className={`p-4 rounded-lg border transition-all ${
                    system.isActive === 1
                      ? "border-green-200 bg-green-50/30"
                      : "bg-card hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{system.name}</h3>
                        {system.isActive === 1 && (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            Active
                          </Badge>
                        )}
                      </div>
                      {system.notes && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {system.notes}
                        </p>
                      )}
                      {system.elements.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-3">
                          {system.elements.map(el => (
                            <Badge key={el.id} variant="outline" className="text-xs">
                              {el.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {system.isActive === 1 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deactivateMutation.mutate({ id: system.id })}
                          disabled={deactivateMutation.isPending}
                        >
                          <PowerOff className="mr-1 h-4 w-4" />
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => activateMutation.mutate({ id: system.id })}
                          disabled={activateMutation.isPending}
                        >
                          <Power className="mr-1 h-4 w-4" />
                          Activate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(system)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(system.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Layers className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold">No systems yet</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Create trading systems to organize your strategies
              </p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Create First System
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={isCreateOpen || editSystem !== null} 
        onOpenChange={(open) => !open && closeDialogs()}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editSystem ? "Edit Trading System" : "Create Trading System"}
            </DialogTitle>
            <DialogDescription>
              {editSystem 
                ? "Update your trading system details and elements"
                : "Define a new trading system with opportunity elements"
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="system-name">Name *</Label>
              <Input
                id="system-name"
                placeholder="e.g., Gap Trading Strategy"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="system-notes">Notes (Optional)</Label>
              <Textarea
                id="system-notes"
                placeholder="Describe your trading system rules and conditions..."
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Trading Elements</Label>
              {elements && elements.length > 0 ? (
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {elements.map((element) => (
                    <div
                      key={element.id}
                      className="flex items-center space-x-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
                      onClick={() => toggleElement(element.id)}
                    >
                      <Checkbox
                        id={`element-${element.id}`}
                        checked={formData.elementIds.includes(element.id)}
                        onCheckedChange={() => toggleElement(element.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <label
                          htmlFor={`element-${element.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {element.name}
                        </label>
                        {element.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {element.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                  No elements available.{" "}
                  <button
                    type="button"
                    className="text-primary underline"
                    onClick={() => {
                      closeDialogs();
                      setLocation("/trading-elements");
                    }}
                  >
                    Create elements first
                  </button>
                </div>
              )}
              {formData.elementIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formData.elementIds.length} element(s) selected
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>
              Cancel
            </Button>
            <Button 
              onClick={editSystem ? handleUpdate : handleCreate} 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editSystem ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete System</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this trading system? Existing transactions linked to this system will retain their association for historical purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate({ id: deleteId })}
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
