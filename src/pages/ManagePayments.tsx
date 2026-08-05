import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Ban, CheckCircle, Search, ChevronLeft, ChevronRight, CalendarIcon, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Calendar } from "@/components/ui/calendar";
import { es } from "date-fns/locale";

const MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const MONTHS_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface UserRow {
  id: string;
  full_name: string;
  email: string;
  blocked: boolean;
  exempt: boolean;
  role: string;
  paidMonths: Set<number>; // months (1-12) paid in the selected year
  paidDates: Map<number, string>; // month -> paid_at ISO date
}

// Grace period: users must pay between day 1 and day 5 of the month
const GRACE_DAY = 5;

const ManagePayments = () => {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingCell, setTogglingCell] = useState<string | null>(null);
  const [togglingBlock, setTogglingBlock] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "blocked" | "ok">("all");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1); // 1-12
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(new Date());
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [dailyOpen, setDailyOpen] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate("/");
      return;
    }
    if (isAdmin) {
      loadPaymentData();
    }
  }, [isAdmin, roleLoading, navigate, year]);

  const loadPaymentData = async () => {
    try {
      setLoading(true);

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, apellidos, email, blocked, payment_exempt")
        .order("full_name");
      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const { data: payments, error: paymentsError } = await supabase
        .from("monthly_payments" as any)
        .select("user_id, month, paid, paid_at")
        .eq("year", year);
      if (paymentsError) throw paymentsError;

      const paidMap = new Map<string, Set<number>>();
      const dateMap = new Map<string, Map<number, string>>();
      ((payments as any[]) || []).forEach((p) => {
        if (!p.paid) return;
        if (!paidMap.has(p.user_id)) paidMap.set(p.user_id, new Set());
        paidMap.get(p.user_id)!.add(p.month);
        if (!dateMap.has(p.user_id)) dateMap.set(p.user_id, new Map());
        if (p.paid_at) dateMap.get(p.user_id)!.set(p.month, p.paid_at);
      });

      const usersData: UserRow[] = (profiles || []).map((profile: any) => {
        const userRole = roles.find((r) => r.user_id === profile.id);
        const fullName = [profile.full_name, profile.apellidos]
          .filter(Boolean)
          .join(" ")
          .trim();
        return {
          id: profile.id,
          full_name: fullName || "Sin nombre",
          email: profile.email || "Sin email",
          blocked: profile.blocked,
          exempt: !!profile.payment_exempt,
          role: userRole?.role || "basica",
          paidMonths: paidMap.get(profile.id) || new Set(),
          paidDates: dateMap.get(profile.id) || new Map(),
        };
      });

      setUsers(usersData);
    } catch (error) {
      console.error("Error loading payment data:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar la información de pagos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const togglePaid = async (userId: string, month: number, currentlyPaid: boolean) => {
    const cellKey = `${userId}-${month}`;
    try {
      setTogglingCell(cellKey);
      if (currentlyPaid) {
        const { error } = await supabase
          .from("monthly_payments" as any)
          .delete()
          .eq("user_id", userId)
          .eq("year", year)
          .eq("month", month);
        if (error) throw error;
      } else {
        var paidAtIso = new Date().toISOString();
        const { error } = await supabase
          .from("monthly_payments" as any)
          .upsert(
            { user_id: userId, year, month, paid: true, paid_at: paidAtIso },
            { onConflict: "user_id,year,month" }
          );
        if (error) throw error;
      }

      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          const next = new Set(u.paidMonths);
          const nextDates = new Map(u.paidDates);
          if (currentlyPaid) {
            next.delete(month);
            nextDates.delete(month);
          } else {
            next.add(month);
            nextDates.set(month, paidAtIso!);
          }
          return { ...u, paidMonths: next, paidDates: nextDates };
        })
      );
    } catch (error) {
      console.error("Error toggling payment:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el pago",
        variant: "destructive",
      });
    } finally {
      setTogglingCell(null);
    }
  };

  const handleBlockToggle = async (userId: string, currentBlockedStatus: boolean) => {
    try {
      setTogglingBlock(userId);
      const newBlockedStatus = !currentBlockedStatus;

      const { error } = await supabase
        .from("profiles")
        .update({ blocked: newBlockedStatus })
        .eq("id", userId);
      if (error) throw error;

      toast({
        title: newBlockedStatus ? "Usuario bloqueado" : "Usuario desbloqueado",
        description: newBlockedStatus
          ? "El usuario no podrá acceder a ninguna funcionalidad"
          : "El usuario puede acceder nuevamente",
      });

      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, blocked: newBlockedStatus } : u)));
    } catch (error) {
      console.error("Error toggling block status:", error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el estado del usuario",
        variant: "destructive",
      });
    } finally {
      setTogglingBlock(null);
    }
  };

  // Whether the selected month is already "due" (past, or current month past grace day).
  const isMonthDue = (): boolean => {
    const today = new Date();
    if (year < today.getFullYear()) return true;
    if (year > today.getFullYear()) return false;
    const currentMonth = today.getMonth() + 1;
    if (selectedMonth < currentMonth) return true;
    if (selectedMonth > currentMonth) return false;
    return today.getDate() > GRACE_DAY;
  };

  const getPendingUsersCount = () => {
    if (!isMonthDue()) return 0;
    return users.filter((u) => !u.exempt && !u.paidMonths.has(selectedMonth) && !u.blocked).length;
  };

  const getUserStatus = (user: UserRow): "blocked" | "pending" | "ok" | "exempt" => {
    if (user.exempt) return "exempt";
    if (user.blocked) return "blocked";
    if (isMonthDue() && !user.paidMonths.has(selectedMonth)) return "pending";
    return "ok";
  };

  const getStatusBadge = (user: UserRow) => {
    const s = getUserStatus(user);
    if (s === "exempt")
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          Exento
        </Badge>
      );
    if (s === "blocked") return <Badge variant="destructive">Bloqueado</Badge>;
    if (s === "pending")
      return <Badge variant="destructive">Pendiente de pago</Badge>;
    return (
      <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20">
        Al día
      </Badge>
    );
  };

  const filteredUsers = users.filter((user) => {
    const s = searchTerm.toLowerCase();
    const matchesSearch =
      user.full_name.toLowerCase().includes(s) || user.email.toLowerCase().includes(s);
    if (!matchesSearch) return false;
    if (statusFilter === "all") return true;
    if (statusFilter === "blocked") return user.blocked;
    if (statusFilter === "pending") {
      if (!isMonthDue()) return false;
      return !user.paidMonths.has(selectedMonth) && !user.blocked;
    }
    if (statusFilter === "ok") return getUserStatus(user) === "ok";
    return true;
  });

  const currentMonthIdx = new Date().getMonth(); // 0-11
  const isCurrentYear = year === new Date().getFullYear();

  const dayKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Map: día (YYYY-MM-DD) -> pagos registrados ese día
  const paymentsByDay = new Map<string, { user: UserRow; month: number }[]>();
  users.forEach((u) => {
    u.paidDates.forEach((iso, month) => {
      const key = dayKey(new Date(iso));
      if (!paymentsByDay.has(key)) paymentsByDay.set(key, []);
      paymentsByDay.get(key)!.push({ user: u, month });
    });
  });
  const daysWithPayments = Array.from(paymentsByDay.keys()).map((k) => {
    const [y, m, d] = k.split("-").map(Number);
    return new Date(y, m - 1, d);
  });
  const selectedDayPayments = selectedDay ? paymentsByDay.get(dayKey(selectedDay)) || [] : [];

  if (roleLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const pendingCount = getPendingUsersCount();
  const blockedCount = users.filter((u) => u.blocked).length;
  const okCount = users.filter((u) => getUserStatus(u) === "ok").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Gestión de Pagos</h1>
        <p className="text-muted-foreground mt-2">
          Marca con un check los meses que cada usuario ha pagado. La fecha límite es del día 1 al 5 de cada mes.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS_FULL.map((m, i) => (
                <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[80px] text-center font-semibold text-lg">{year}</div>
          <Button variant="outline" size="icon" onClick={() => setYear((y) => y + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card
          onClick={() => setStatusFilter("all")}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${
            statusFilter === "all" ? "ring-2 ring-primary" : ""
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Usuarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setStatusFilter(statusFilter === "pending" ? "all" : "pending")}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${
            statusFilter === "pending" ? "ring-2 ring-primary" : ""
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pendiente {MONTHS_FULL[selectedMonth - 1]}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{pendingCount}</div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setStatusFilter(statusFilter === "blocked" ? "all" : "blocked")}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${
            statusFilter === "blocked" ? "ring-2 ring-primary" : ""
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Bloqueados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{blockedCount}</div>
          </CardContent>
        </Card>
        <Card
          onClick={() => setStatusFilter(statusFilter === "ok" ? "all" : "ok")}
          className={`cursor-pointer transition-colors hover:bg-muted/40 ${
            statusFilter === "ok" ? "ring-2 ring-primary" : ""
          }`}
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Al día {MONTHS_FULL[selectedMonth - 1]}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{okCount}</div>
          </CardContent>
        </Card>
      </div>

      <Collapsible open={dailyOpen} onOpenChange={setDailyOpen}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <CardTitle className="flex flex-wrap items-center gap-2 cursor-pointer select-none">
                <span>Pagos por día</span>
                <Badge variant="secondary" className="shrink-0">
                  {selectedDayPayments.length}
                </Badge>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 font-normal"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CalendarIcon className="h-4 w-4" />
                      {selectedDay
                        ? selectedDay.toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "Seleccionar fecha"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" align="start">
                    <Calendar
                      mode="single"
                      locale={es}
                      selected={selectedDay}
                      onSelect={setSelectedDay}
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      modifiers={{ hasPayments: daysWithPayments }}
                      modifiersClassNames={{
                        hasPayments: "bg-green-500/15 text-green-700 font-semibold rounded-md",
                      }}
                      className="p-2 pointer-events-auto text-xs"
                    />
                  </PopoverContent>
                </Popover>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ml-auto ${
                    dailyOpen ? "rotate-180" : ""
                  }`}
                />
              </CardTitle>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {selectedDayPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {selectedDay
                    ? "No hay pagos registrados este día."
                    : "Selecciona una fecha para ver los pagos."}
                </p>
              ) : (
                <ul className="divide-y rounded-md border max-h-72 overflow-y-auto">
                  {selectedDayPayments.map(({ user, month }) => (
                    <li
                      key={`${user.id}-${month}`}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="font-medium break-words">{user.full_name}</div>
                        <div className="text-xs text-muted-foreground break-all">{user.email}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs bg-green-500/10 text-green-700 border-green-500/20">
                        Cuota {MONTHS_FULL[month - 1]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader>
          <CardTitle>Meses pagados - {year}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 sticky left-0 bg-card z-10 min-w-[220px]">Usuario</th>
                  {MONTHS.map((m, i) => (
                    <th
                      key={m}
                      className={`text-center p-2 font-medium ${
                        isCurrentYear && i === currentMonthIdx ? "text-primary" : ""
                      }`}
                    >
                      {m}
                    </th>
                  ))}
                  <th className="text-center p-2">Estado</th>
                  <th className="text-center p-2">Acceso</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={15} className="text-center text-muted-foreground py-8">
                      {searchTerm ? "No se encontraron usuarios" : "No hay usuarios registrados"}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 sticky left-0 bg-card z-10 align-top">
                        <div className="font-medium whitespace-normal break-words">
                          {user.full_name}
                        </div>
                        <div className="text-xs text-muted-foreground break-all max-w-[220px]">
                          {user.email}
                        </div>
                      </td>
                      {MONTHS.map((_, i) => {
                        const month = i + 1;
                        const paid = user.paidMonths.has(month);
                        const cellKey = `${user.id}-${month}`;
                        const isCurrent = isCurrentYear && i === currentMonthIdx;
                        const paidAt = user.paidDates.get(month);
                        const paidAtLabel = paidAt
                          ? new Date(paidAt).toLocaleString("es-ES", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : null;
                        return (
                          <td key={month} className="p-1 text-center">
                            <button
                              onClick={() => togglePaid(user.id, month, paid)}
                              disabled={togglingCell === cellKey}
                              className={`w-9 h-9 rounded-md border-2 flex items-center justify-center mx-auto transition-colors ${
                                paid
                                  ? "bg-green-500 border-green-600 text-white hover:bg-green-600"
                                  : isCurrent
                                  ? "bg-yellow-100 border-yellow-400 hover:bg-yellow-200"
                                  : "bg-transparent border-muted-foreground/30 hover:bg-muted"
                              }`}
                              title={
                                paid
                                  ? paidAtLabel
                                    ? `Pagado el ${paidAtLabel}`
                                    : "Marcado como pagado (sin fecha registrada)"
                                  : "Marcar como pagado"
                              }
                            >
                              {togglingCell === cellKey ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : paid ? (
                                <CheckCircle className="h-5 w-5" />
                              ) : null}
                            </button>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center">{getStatusBadge(user)}</td>
                      <td className="p-2 text-center">
                        <Button
                          size="sm"
                          variant={user.blocked ? "default" : "destructive"}
                          onClick={() => handleBlockToggle(user.id, user.blocked)}
                          disabled={togglingBlock === user.id}
                          className="gap-1"
                        >
                          {togglingBlock === user.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : user.blocked ? (
                            <>
                              <CheckCircle className="h-4 w-4" />
                              Desbloquear
                            </>
                          ) : (
                            <>
                              <Ban className="h-4 w-4" />
                              Bloquear
                            </>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManagePayments;
