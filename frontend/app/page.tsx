import Link from 'next/link'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Play,
  MessageCircle,
  Wallet,
  Calendar,
  TrendingUp,
  Zap,
  Shield,
  BarChart3,
  Percent,
  Home,
  Bell,
  CalendarPlus,
  Upload,
  Settings,
  Eye,
} from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-[#FF8A80] flex items-center justify-center shadow-lg shadow-primary/25">
                <Wallet className="size-5 text-white" />
              </div>
              <span className="font-heading font-semibold text-xl text-foreground">
                Ruculapp
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-muted-foreground hover:text-foreground transition-colors">
                Funciones
              </a>
              <a href="#how-it-works" className="text-muted-foreground hover:text-foreground transition-colors">
                Cómo funciona
              </a>
            </nav>
            <Link href="/dashboard">
              <Button size="sm" className="bg-primary hover:bg-primary/90">
                Ir al Dashboard
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-sm font-medium text-accent mb-6">
            BETA
          </span>
          <h1 className="font-heading text-5xl md:text-7xl font-semibold mb-6 leading-tight text-foreground">
            Tu dinero bajo{' '}
            <span className="text-gradient-coral">
              control total
            </span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Analizá tus gastos, proyectá tu futuro financiero con IPC real,
            y recibí alertas inteligentes sobre renovaciones y vencimientos.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/dashboard">
              <Button size="lg" className="bg-primary hover:bg-primary/90 px-8 py-6 text-lg font-semibold w-full sm:w-auto shadow-lg shadow-primary/25">
                <Play className="mr-2 size-5" />
                Empezar gratis
              </Button>
            </Link>
            <Link href="/chat">
              <Button size="lg" variant="outline" className="border-accent text-accent hover:bg-accent/10 px-8 py-6 text-lg w-full sm:w-auto">
                <MessageCircle className="mr-2 size-5" />
                Hablar con el asistente
              </Button>
            </Link>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 max-w-4xl mx-auto">
            <div className="card-premium p-5 text-center">
              <Calendar className="size-6 text-primary mx-auto mb-2" />
              <p className="font-heading text-3xl font-semibold text-foreground">2+</p>
              <p className="text-sm text-muted-foreground">Años de datos</p>
            </div>
            <div className="card-premium p-5 text-center">
              <TrendingUp className="size-6 text-accent mx-auto mb-2" />
              <p className="font-heading text-3xl font-semibold text-foreground">IPC</p>
              <p className="text-sm text-muted-foreground">Integrado (INDEC)</p>
            </div>
            <div className="card-premium p-5 text-center">
              <Zap className="size-6 text-[#8B5CF6] mx-auto mb-2" />
              <p className="font-heading text-3xl font-semibold text-foreground">24/7</p>
              <p className="text-sm text-muted-foreground">Asistente IA</p>
            </div>
            <div className="card-premium p-5 text-center">
              <Shield className="size-6 text-income mx-auto mb-2" />
              <p className="font-heading text-3xl font-semibold text-foreground">100%</p>
              <p className="text-sm text-muted-foreground">Privado</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-secondary/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-4xl font-semibold text-foreground mb-4">
              Todo lo que necesitás para tus finanzas
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Herramientas diseñadas para la realidad argentina
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={BarChart3}
              title="Análisis mensual"
              description="Mirá cuánto gastaste en marzo pasado o proyectá cuánto vas a gastar en enero próximo."
              color="bg-[#8B5CF6]"
            />
            <FeatureCard
              icon={Percent}
              title="IPC integrado"
              description="Datos oficiales de INDEC actualizados. Tus proyecciones se ajustan automáticamente."
              color="bg-accent"
            />
            <FeatureCard
              icon={Home}
              title="Gastos fijos inteligentes"
              description="Configurá que tu alquiler sube por IPC cada 3 meses. El sistema lo proyecta solo."
              color="bg-[#F59E0B]"
            />
            <FeatureCard
              icon={Bell}
              title="Alertas de renovación"
              description="¿Se vence el contrato? Te avisamos y calculamos depósito, garantía y mudanza."
              color="bg-primary"
            />
            <FeatureCard
              icon={MessageCircle}
              title="Asistente con IA"
              description="Preguntale cualquier cosa sobre tus finanzas. Entiende tu contexto y da consejos útiles."
              color="bg-income"
            />
            <FeatureCard
              icon={CalendarPlus}
              title="Eventos financieros"
              description="Cargá aguinaldos, bonos, o gastos únicos futuros. Todo se refleja en las proyecciones."
              color="bg-[#3B82F6]"
            />
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-heading text-4xl font-semibold text-foreground mb-4">
              Cómo funciona
            </h2>
            <p className="text-muted-foreground text-lg">
              En 3 simples pasos
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#FF8A80] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/25">
                1
              </div>
              <div className="pl-12 pt-1">
                <div className="card-premium p-6 h-full">
                  <Upload className="size-8 text-primary mb-4" />
                  <h3 className="font-heading text-xl font-semibold text-foreground mb-2">Cargá tus datos</h3>
                  <p className="text-muted-foreground">Importá tus transacciones o empezá con datos de ejemplo para probar.</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#FF8A80] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/25">
                2
              </div>
              <div className="pl-12 pt-1">
                <div className="card-premium p-6 h-full">
                  <Settings className="size-8 text-primary mb-4" />
                  <h3 className="font-heading text-xl font-semibold text-foreground mb-2">Configurá tus gastos fijos</h3>
                  <p className="text-muted-foreground">Indicá alquiler, servicios, suscripciones y sus reglas de ajuste.</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -left-4 top-0 w-12 h-12 rounded-full bg-gradient-to-br from-primary to-[#FF8A80] flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-primary/25">
                3
              </div>
              <div className="pl-12 pt-1">
                <div className="card-premium p-6 h-full">
                  <Eye className="size-8 text-primary mb-4" />
                  <h3 className="font-heading text-xl font-semibold text-foreground mb-2">Visualizá y proyectá</h3>
                  <p className="text-muted-foreground">Explorá mes a mes, pasado y futuro. Recibí alertas y consejos.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="font-heading text-4xl font-semibold text-foreground mb-4">
            ¿Listo para tomar el control?
          </h2>
          <p className="text-xl text-muted-foreground mb-8">
            Empezá a entender tu dinero hoy. Es gratis.
          </p>
          <Link href="/dashboard">
            <Button size="lg" className="bg-foreground text-background hover:bg-foreground/90 px-10 py-6 text-lg font-semibold">
              Ir al Dashboard
              <ArrowRight className="ml-2 size-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-[#FF8A80] flex items-center justify-center shadow-lg shadow-primary/20">
                <Wallet className="size-4 text-white" />
              </div>
              <span className="font-heading font-semibold text-lg text-foreground">
                Ruculapp
              </span>
            </div>
            <p className="text-muted-foreground text-sm">
              Hecho con ❤️ en Argentina
            </p>
            <div className="flex gap-4">
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a href="#" className="text-muted-foreground hover:text-foreground transition-colors">
                <svg className="size-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
}: {
  icon: typeof BarChart3
  title: string
  description: string
  color: string
}) {
  return (
    <div className="card-premium-hover group p-6">
      <div className={`w-14 h-14 rounded-2xl ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-lg`}>
        <Icon className="size-7 text-white" />
      </div>
      <h3 className="font-heading text-xl font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
