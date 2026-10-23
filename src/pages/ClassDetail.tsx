import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Calendar, Clock, Users, Lock, UserPlus, X } from "lucide-react";
import { useBlockedStatus } from "@/hooks/useBlockedStatus";
import { useUserRole } from "@/hooks/useUserRole";
import { useMonthlyClassesRemaining } from "@/hooks/useMonthlyClassesRemaining";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { format, isBefore, setHours, setMinutes, getDaysInMonth, startOfMonth, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { FreeTrainingBooking } from "@/components/FreeTrainingBooking";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";

interface ClassData {
  id: string;
  name: string;
  description: string;
  image_url: string;
  is_free_training: boolean;
}

interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Schedule {
  id: string;
  day_of_week: number;
  start_time: string;
  duration_minutes: number;
  max_capacity: number;
  month_start_date: string;
  class_id: string;
  created_at: string;
  updated_at: string;
}

interface ScheduleInstance {
  scheduleId: string;
  date: Date;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  maxCapacity: number;
  monthStartDate: string;
}

interface Booking {
  user_id: string;
  status: 'confirmed' | 'waitlist';
  position: number | null;
  class_date: string;
  profiles: {
    full_name: string;
    apellidos: string;
    avatar_url: string;
  } | null;
}

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Helper function to get all dates in month for a specific day of week
const getMonthDatesForDayOfWeek = (monthStart: Date, dayOfWeek: number): Date[] => {
  const dates: Date[] = [];
  const daysInMonth = getDaysInMonth(monthStart);
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    if (getDay(date) === dayOfWeek) {
      dates.push(date);
    }
  }
  
  return dates;
};

export default function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isBlocked } = useBlockedStatus();
  const { isAdmin, role, canBookClasses } = useUserRole();
  const [userId, setUserId] = useState<string | null>(null);
  const { classesRemaining, hasClassesRemaining, loading: loadingClasses } = useMonthlyClassesRemaining(userId);
  const [classData, setClassData] = useState<ClassData | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [scheduleInstances, setScheduleInstances] = useState<ScheduleInstance[]>([]);
  const [bookings, setBookings] = useState<Record<string, Booking[]>>({});
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [showAdminBookingDialog, setShowAdminBookingDialog] = useState(false);
  const [adminBookingScheduleId, setAdminBookingScheduleId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [openUserSelect, setOpenUserSelect] = useState(false);

  useEffect(() => {
    // Force reload when component mounts or id changes
    setSchedules([]);
    setScheduleInstances([]);
    loadData();
  }, [id]);

  // Subscribe to real-time updates for bookings
  useEffect(() => {
    if (!id || schedules.length === 0) return;

    const scheduleIds = schedules.map(s => s.id);
    if (scheduleIds.length === 0) return;

    const channel = supabase
      .channel(`class-${id}-bookings`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_bookings'
        },
        async (payload) => {
          console.log('Booking change detected:', payload);
          // Reload only the bookings data, not everything
          const bookingsData: Record<string, Booking[]> = {};
          for (const instance of scheduleInstances) {
            const dateKey = `${instance.scheduleId}-${format(instance.date, 'yyyy-MM-dd')}`;
            const { data: bookings, error } = await supabase
              .from("class_bookings")
              .select("user_id, status, position, class_date")
              .eq("schedule_id", instance.scheduleId)
              .eq("class_date", format(instance.date, 'yyyy-MM-dd'))
              .order("status", { ascending: true })
              .order("position", { ascending: true, nullsFirst: false });

            if (!error && bookings && bookings.length > 0) {
              // Get user IDs and load profiles separately
              const userIds = bookings.map(b => b.user_id);
              const { data: profiles } = await supabase
                .from("profiles_public")
                .select("id, full_name, apellidos, avatar_url")
                .in("id", userIds);

              // Create a map of profiles by user_id
              const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

              // Merge bookings with their profiles
              bookingsData[dateKey] = bookings.map(booking => ({
                ...booking,
                profiles: profilesMap.get(booking.user_id) || null
              })) as any;
            }
          }
          setBookings(bookingsData);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, schedules, scheduleInstances]);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  const loadUsers = async () => {
    try {
      // First get all profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      
      if (profilesError) throw profilesError;

      // Then get all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Create a map of user_id to role
      const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);

      // Map users with their roles and filter those who can book classes
      const usersWithRoles = (profilesData || [])
        .map((profile: any) => ({
          id: profile.id,
          full_name: profile.full_name || 'Sin nombre',
          email: profile.email || '',
          role: roleMap.get(profile.id) || 'basica'
        }))
        .filter((user: UserWithRole) => 
          user.role === 'basica_clases' || 
          user.role === 'full' || 
          user.role === 'admin'
        );
      
      setUsers(usersWithRoles);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      // Load class data
      const { data: classInfo, error: classError } = await supabase
        .from("classes")
        .select("*")
        .eq("id", id)
        .single();

      if (classError) throw classError;
      setClassData(classInfo);

      // Load ALL schedules for this class (no month filter)
      const { data: schedulesData, error: schedulesError } = await supabase
        .from("class_schedules")
        .select("*")
        .eq("class_id", id)
        .order("day_of_week")
        .order("start_time");

      if (schedulesError) throw schedulesError;
      
      setSchedules(schedulesData || []);

      // Generate schedule instances for the CURRENT week only (Monday-Sunday).
      // Users can only book classes for this week; next week's schedule may change.
      const now = new Date();
      const instances: ScheduleInstance[] = [];

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Rolling 7-day window: users can book any class in the next 7 days
      // (no need to wait until Monday 00:01).
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      
      for (const schedule of schedulesData || []) {
        // Start from today
        let checkDate = new Date(today);
        
        // Find all occurrences of this day of week until endDate
        while (checkDate <= endDate) {
          if (checkDate.getDay() === schedule.day_of_week) {
            const [hours, minutes] = schedule.start_time.split(':').map(Number);
            const scheduleDateTime = setMinutes(setHours(new Date(checkDate), hours), minutes);
            
            // Only include future dates
            if (!isBefore(scheduleDateTime, now)) {
              instances.push({
                scheduleId: schedule.id,
                date: new Date(checkDate),
                dayOfWeek: schedule.day_of_week,
                startTime: schedule.start_time,
                durationMinutes: schedule.duration_minutes,
                maxCapacity: schedule.max_capacity,
                monthStartDate: schedule.month_start_date || format(checkDate, 'yyyy-MM-dd')
              });
            }
          }
          // Move to next day
          checkDate.setDate(checkDate.getDate() + 1);
        }
      }
      
      // Sort instances by date
      instances.sort((a, b) => a.date.getTime() - b.date.getTime());
      setScheduleInstances(instances);

      // Load bookings for each instance (grouped by schedule_id + date)
      const bookingsData: Record<string, Booking[]> = {};
      for (const instance of instances) {
        const dateKey = `${instance.scheduleId}-${format(instance.date, 'yyyy-MM-dd')}`;
        const { data: bookings, error } = await supabase
          .from("class_bookings")
          .select("user_id, status, position, class_date")
          .eq("schedule_id", instance.scheduleId)
          .eq("class_date", format(instance.date, 'yyyy-MM-dd'))
          .order("status", { ascending: true })
          .order("position", { ascending: true, nullsFirst: false });

        if (!error && bookings && bookings.length > 0) {
          // Get user IDs and load profiles separately
          const userIds = bookings.map(b => b.user_id);
          const { data: profiles } = await supabase
            .from("profiles_public")
            .select("id, full_name, apellidos, avatar_url")
            .in("id", userIds);

          // Create a map of profiles by user_id
          const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

          // Merge bookings with their profiles
          bookingsData[dateKey] = bookings.map(booking => ({
            ...booking,
            profiles: profilesMap.get(booking.user_id) || null
          })) as any;
        }
      }
      setBookings(bookingsData);
    } catch (error) {
      console.error("Error loading class:", error);
      toast({
        title: "Error",
        description: "No se pudo cargar la clase",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBooking = async (scheduleId: string, classDate: Date, targetUserId?: string) => {
    const bookingUserId = targetUserId || userId;
    const dateKey = `${scheduleId}-${format(classDate, 'yyyy-MM-dd')}`;
    
    if (!bookingUserId) {
      toast({
        title: "Error",
        description: "Debes iniciar sesión para apuntarte",
        variant: "destructive",
      });
      return;
    }

    if (!targetUserId && isBlocked) {
      toast({
        title: "Cuenta bloqueada",
        description: "Tu cuenta ha sido bloqueada. Contacta con el administrador.",
        variant: "destructive",
      });
      return;
    }

    try {
      const isBooked = bookings[dateKey]?.some(b => b.user_id === bookingUserId);

      if (isBooked) {
        // Check if cancellation is at least 1 hour before class (only for regular users)
        if (!targetUserId) {
          const schedule = schedules.find(s => s.id === scheduleId);
          if (schedule) {
            const [hours, minutes] = schedule.start_time.split(':').map(Number);
            const scheduleDateTime = setMinutes(setHours(classDate, hours), minutes);
            const oneHourBefore = new Date(scheduleDateTime.getTime() - 60 * 60 * 1000);
            
            if (new Date() >= oneHourBefore) {
              toast({
                title: "No se puede cancelar",
                description: "Debes cancelar con al menos 1 hora de antelación",
                variant: "destructive",
              });
              return;
            }
          }
        }

        // Cancel booking
        const { error } = await supabase
          .from("class_bookings")
          .delete()
          .eq("schedule_id", scheduleId)
          .eq("class_date", format(classDate, 'yyyy-MM-dd'))
          .eq("user_id", bookingUserId);

        if (error) throw error;

        toast({
          title: "Cancelado",
          description: targetUserId ? "Usuario dado de baja de la clase" : "Te has dado de baja de esta clase",
        });
      } else {
        // Create booking with specific date
        const { data: newBooking, error } = await supabase
          .from("class_bookings")
          .insert({
            schedule_id: scheduleId,
            user_id: bookingUserId,
            class_date: format(classDate, 'yyyy-MM-dd'),
          })
          .select()
          .single();

        if (error) throw error;

        // Check if user was placed on waitlist
        if (newBooking?.status === 'waitlist') {
          toast({
            title: "En lista de espera",
            description: targetUserId 
              ? `Usuario en lista de espera (posición ${newBooking.position})` 
              : `Estás en lista de espera (posición ${newBooking.position}). Te avisaremos si se libera una plaza.`,
            variant: "default",
          });
        } else {
          toast({
            title: "¡Apuntado!",
            description: targetUserId 
              ? "Usuario apuntado a la clase" 
              : "Te has apuntado a esta clase. Recuerda: si no cancelas con al menos 1 hora de antelación, perderás esta clase.",
          });
        }
      }

      loadData();
    } catch (error: any) {
      console.error("Error with booking:", error);
      
      // Check if it's a booking limit error
      if (error.message?.includes("check_booking_limit") || 
          error.code === "P0001" || 
          error.message?.toLowerCase().includes("limit")) {
        toast({
          title: "Clases agotadas",
          description: targetUserId 
            ? "El usuario ha agotado sus 12 clases mensuales disponibles. Las clases se renovarán el próximo mes."
            : "Has agotado tus 12 clases mensuales disponibles. Tus clases se renovarán automáticamente el próximo mes.",
          variant: "destructive",
        });
      } else if (error.message?.includes("row-level security")) {
        toast({
          title: "Error de permisos",
          description: "No tienes permisos para realizar esta reserva. Contacta con un administrador.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error al reservar",
          description: error.message || "No se pudo procesar la reserva. Inténtalo de nuevo.",
          variant: "destructive",
        });
      }
    }
  };

  const [adminBookingDate, setAdminBookingDate] = useState<Date | null>(null);

  const handleAdminBooking = () => {
    if (!selectedUserId) {
      toast({
        title: "Error",
        description: "Debes seleccionar un usuario",
        variant: "destructive",
      });
      return;
    }
    
    if (adminBookingScheduleId && adminBookingDate) {
      handleBooking(adminBookingScheduleId, adminBookingDate, selectedUserId);
      setShowAdminBookingDialog(false);
      setSelectedUserId("");
      setAdminBookingScheduleId(null);
      setAdminBookingDate(null);
    }
  };

  const openAdminBookingDialog = (scheduleId: string, date: Date) => {
    setAdminBookingScheduleId(scheduleId);
    setAdminBookingDate(date);
    setShowAdminBookingDialog(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!classData) {
    return (
      <div className="container py-8">
        <p>Clase no encontrada</p>
      </div>
    );
  }

  return (
    <div className="container py-4 md:py-8 px-4">
      <Button
        variant="ghost"
        onClick={() => navigate("/classes")}
        className="mb-4"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver
      </Button>

      {isBlocked && (
        <Alert variant="destructive" className="mb-4 border-destructive/50 bg-destructive/10">
          <Lock className="h-4 w-4" />
          <AlertTitle>Cuenta bloqueada</AlertTitle>
          <AlertDescription>
            Tu cuenta ha sido bloqueada por el administrador. No puedes reservar clases.
          </AlertDescription>
        </Alert>
      )}

      {!canBookClasses && !isBlocked && role === "basica" && (
        <Alert className="mb-4 border-primary/50 bg-primary/10">
          <Lock className="h-4 w-4" />
          <AlertTitle>Suscripción Básica</AlertTitle>
          <AlertDescription>
            Tu suscripción actual solo incluye acceso a las máquinas del gimnasio. Para apuntarte a clases, contacta con un administrador para actualizar tu suscripción a Básica + Clases o Full.
          </AlertDescription>
        </Alert>
      )}

      {!isAdmin && canBookClasses && !isBlocked && !hasClassesRemaining && !loadingClasses && (
        <Alert variant="destructive" className="mb-4 border-destructive/50 bg-destructive/10">
          <Lock className="h-4 w-4" />
          <AlertTitle>Límite de clases alcanzado</AlertTitle>
          <AlertDescription>
            Has agotado tus {role === "basica_clases" || role === "full" ? "12" : ""} clases mensuales. No puedes reservar más clases hasta el próximo mes.
          </AlertDescription>
        </Alert>
      )}

      

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2">
          <Card className="bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-md border-primary/30 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
            <div className="aspect-video w-full overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10"></div>
              <img
                src={classData.image_url || "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800"}
                alt={classData.name}
                className="w-full h-full object-cover"
              />
            </div>
            <CardHeader className="text-center">
              <CardTitle className="font-bebas text-3xl md:text-5xl tracking-wider text-primary drop-shadow-[0_0_25px_hsl(var(--primary)/0.6)]">
                {classData.name}
              </CardTitle>
              <CardDescription className="text-base">
                {classData.description}
              </CardDescription>
            </CardHeader>
          </Card>

          {classData.is_free_training ? (
            <div className="mt-4 md:mt-6">
              {userId && (
                <FreeTrainingBooking
                  classId={classData.id}
                  className={classData.name}
                  userId={userId}
                  onBookingSuccess={loadData}
                  isBlocked={isBlocked}
                  canBookClasses={canBookClasses}
                  isAdmin={isAdmin}
                />
              )}
            </div>
          ) : (
            <>
              {scheduleInstances.length > 0 && (
                <Card className="mt-4 md:mt-6 bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-md border-primary/30 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
                  <CardHeader className="text-center">
                    <CardTitle className="font-bebas text-2xl md:text-4xl tracking-wider text-primary">
                      HORARIOS DEL MES
                    </CardTitle>
                    <CardDescription>
                      Selecciona las clases que quieres reservar
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {scheduleInstances.map((instance) => {
                      const dateKey = `${instance.scheduleId}-${format(instance.date, 'yyyy-MM-dd')}`;
                      const userBooking = bookings[dateKey]?.find(b => b.user_id === userId);
                      const confirmedBookings = bookings[dateKey]?.filter(b => b.status === 'confirmed') || [];
                      const waitlistBookings = bookings[dateKey]?.filter(b => b.status === 'waitlist') || [];
                      const confirmedCount = confirmedBookings.length;
                      const isFull = confirmedCount >= instance.maxCapacity;
                      const isBooked = !!userBooking;
                      const isOnWaitlist = userBooking?.status === 'waitlist';

                      const formattedDate = format(instance.date, "EEEE d 'de' MMMM", { locale: es });

                      return (
                        <div
                          key={dateKey}
                          className="flex flex-col p-3 md:p-4 border border-primary/20 rounded-lg hover:bg-accent/50 hover:border-primary/40 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs capitalize">
                                  <Calendar className="mr-1 h-3 w-3" />
                                  {formattedDate}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  <Clock className="mr-1 h-3 w-3" />
                                  {instance.startTime.slice(0, 5)}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  <Users className="mr-1 h-3 w-3" />
                                  {confirmedCount}/{instance.maxCapacity}
                                </Badge>
                                {waitlistBookings.length > 0 && (
                                  <Badge variant="secondary" className="text-xs bg-primary/20">
                                    +{waitlistBookings.length} en espera
                                  </Badge>
                                )}
                                {isOnWaitlist && (
                                  <Badge variant="secondary" className="text-xs bg-accent">
                                    Posición {userBooking.position}
                                  </Badge>
                                )}
                              </div>
                              {isFull && !isBooked && (
                                <div className="mt-2 text-xs bg-accent/50 border border-primary/30 rounded p-2">
                                  <span className="font-semibold text-foreground">COMPLETO</span>
                                  <span className="text-muted-foreground"> - Puedes apuntarte a la lista de espera y te avisaremos si nos queda algún hueco libre</span>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                              {isAdmin && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAdminBookingDialog(instance.scheduleId, instance.date)}
                                  className="text-xs"
                                >
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Apuntar usuario
                                </Button>
                              )}
                              {!isBooked ? (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => handleBooking(instance.scheduleId, instance.date)}
                                  disabled={isBlocked || !canBookClasses || (!isAdmin && !hasClassesRemaining)}
                                  className="text-xs"
                                >
                                  Apuntarme
                                </Button>
                              ) : (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleBooking(instance.scheduleId, instance.date)}
                                  disabled={isBlocked}
                                  className="text-xs"
                                >
                                  <X className="h-3 w-3 mr-1" />
                                  Cancelar
                                </Button>
                              )}
                            </div>
                          </div>

                          {(isAdmin || selectedSchedule === dateKey) && (confirmedBookings.length > 0 || waitlistBookings.length > 0) && (
                            <div className="mt-3 pt-3 border-t border-border">
                              <h4 className="text-sm font-medium mb-2">
                                Confirmados ({confirmedBookings.length}):
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {confirmedBookings.map((booking) => (
                                  <div key={booking.user_id} className="flex items-center gap-2 p-2 bg-accent/30 rounded">
                                    <UserAvatar
                                      avatarUrl={booking.profiles?.avatar_url}
                                      fullName={booking.profiles?.full_name}
                                      size="sm"
                                    />
                                    <span className="text-sm">
                                      {booking.profiles?.full_name} {booking.profiles?.apellidos || ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {waitlistBookings.length > 0 && (
                                <>
                                  <h4 className="text-sm font-medium mb-2 mt-3">
                                    Lista de espera ({waitlistBookings.length}):
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {waitlistBookings.map((booking) => (
                                      <div key={booking.user_id} className="flex items-center gap-2 p-2 bg-accent/20 rounded">
                                        <Badge variant="outline" className="text-xs">
                                          {booking.position}
                                        </Badge>
                                        <UserAvatar
                                          avatarUrl={booking.profiles?.avatar_url}
                                          fullName={booking.profiles?.full_name}
                                          size="sm"
                                        />
                                        <span className="text-sm">
                                          {booking.profiles?.full_name} {booking.profiles?.apellidos || ""}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          {!isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedSchedule(selectedSchedule === dateKey ? null : dateKey)}
                              className="text-xs mt-2"
                            >
                              {selectedSchedule === dateKey ? "Ocultar" : "Ver"} apuntados ({confirmedCount + waitlistBookings.length})
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}

              {scheduleInstances.length === 0 && (
                <Card className="mt-4 md:mt-6">
                  <CardContent className="p-8 md:p-12 text-center">
                    <p className="text-muted-foreground">No hay horarios disponibles para esta clase este mes</p>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className="bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-md border-primary/30">
            <CardHeader>
              <CardTitle className="font-bebas text-xl md:text-2xl tracking-wider">
                INFORMACIÓN
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Duración</h3>
                <p className="text-sm text-muted-foreground">
                  {schedules[0]?.duration_minutes || 60} minutos
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Capacidad</h3>
                <p className="text-sm text-muted-foreground">
                  Máximo {schedules[0]?.max_capacity || 20} personas
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">Reservas</h3>
                <p className="text-sm text-muted-foreground">
                  Las reservas se pueden cancelar hasta 1 hora antes de la clase. Si no cancelas a tiempo, perderás esa clase.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Admin booking dialog */}
      <Dialog open={showAdminBookingDialog} onOpenChange={setShowAdminBookingDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Apuntar usuario a clase</DialogTitle>
            <DialogDescription>
              Selecciona un usuario para apuntarlo a esta clase
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Popover open={openUserSelect} onOpenChange={setOpenUserSelect}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={openUserSelect}
                  className="w-full justify-between"
                >
                  {selectedUserId
                    ? users.find((user) => user.id === selectedUserId)?.full_name
                    : "Seleccionar usuario..."}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Buscar usuario..." />
                  <CommandEmpty>No se encontraron usuarios.</CommandEmpty>
                  <CommandGroup>
                    {users.map((user) => {
                      const roleColors = {
                        admin: "bg-primary text-primary-foreground",
                        full: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50",
                        basica_clases: "bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/50"
                      };
                      const roleLabels = {
                        admin: "Admin",
                        full: "Full (60€)",
                        basica_clases: "Clases (40€)"
                      };
                      
                      return (
                        <CommandItem
                          key={user.id}
                          value={user.full_name}
                          onSelect={() => {
                            setSelectedUserId(user.id);
                            setOpenUserSelect(false);
                          }}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Check
                              className={`h-4 w-4 ${
                                selectedUserId === user.id ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            <span>{user.full_name}</span>
                          </div>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${roleColors[user.role as keyof typeof roleColors]}`}
                          >
                            {roleLabels[user.role as keyof typeof roleLabels]}
                          </Badge>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAdminBookingDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdminBooking}>Apuntar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
