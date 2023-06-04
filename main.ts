const SSID: string = "Zonet"
const PASSWORD: string = ""
const PUERTO_API: string = "6614"
const DIRECCION_API: string = "192.168.1.142"
const RESPUESTA: number = 7

let cadena_serial: string = ""

const periodo: number = 37
let gesto: string = ''
let serie_tiempo = {
    x: [0],
    y: [0],
    z: [0]
}


function enviar_AT(comando: string, tiempo_espera: number = 100) {
    serial.writeString(comando + "\u000D\u000A")
    basic.pause(tiempo_espera)
}
function esperar_respuesta(estado: string, tiempo_espera: number = 5000): boolean {
    let resultado: boolean = false
    let tiempo_inicio: number = input.runningTime()

    while (true) {
        cadena_serial += serial.readString()
        if (cadena_serial.includes(estado)) {
            resultado = true
            break
        }
        if (input.runningTime() - tiempo_inicio > tiempo_espera) {
            resultado = false
            break
        }
    }
    return resultado
}
function comando_AT(comando: string, estado: string, tiempo_espera: number = 1000, limpiar_serial: boolean = true, estricto_resolver: boolean = false) {
    enviar_AT(comando)
    let exito: boolean = false
    if (estricto_resolver) {
        while (!exito)
            exito = esperar_respuesta(estado, tiempo_espera)
    } else {
        exito = esperar_respuesta(estado, tiempo_espera)
    }
    if (limpiar_serial) cadena_serial = ""
    return exito
}
function limpiar_serie_tiempo() {
    serie_tiempo.x = []
    serie_tiempo.y = []
    serie_tiempo.z = []
}
function crear_peticion_HTTP(metodo: string, pagina: string, contenido: string, contenido_json: boolean = false) {
    if (contenido_json) {
        return `${metodo} ${pagina} HTTP/1.1
Host:${DIRECCION_API}
Accept: application/json;text/plain
Content-Type: application/json
Content-Length: ${contenido.length}

${contenido}`
    } else {
        return metodo + " " + pagina + (contenido.length > 0 ? "?" + contenido : "") + " HTTP/1.1\r\n" + "Host:" + DIRECCION_API + "\r\n\r\n"
    }
}
function recuperar_respuesta(cadena: string) {
    const largo_contenido: number = parseInt(cadena[cadena.indexOf("content-length") + 16]) - RESPUESTA
    return cadena.substr(cadena.length - (RESPUESTA + largo_contenido) + 1, largo_contenido)
}
function solicitar_api(metodo: string, pagina: string, contenido: string, contenido_json: boolean, tiempo_espera: number = 5000, extender_tiempo_servidor: boolean = false) {
    if (!comando_AT("AT+CIPSTART=\"TCP\",\"" + DIRECCION_API + "\"," + PUERTO_API, "OK", tiempo_espera, true)) {
        basic.showString("E0")
        return '-1'
    }

    let peticion_http: string = crear_peticion_HTTP(metodo, pagina, contenido, contenido_json)
    if (!comando_AT("AT+CIPSEND=" + peticion_http.length, ">", tiempo_espera)) {
        basic.showString("E1")
        return '-1'
    }

    if (!comando_AT(peticion_http, ':resp"', extender_tiempo_servidor ? 20000 : tiempo_espera, false)) {
        basic.showString("E2")
        return '-1'
    }

    let cadena_respuesta: string = cadena_serial
    cadena_serial = ""

    if (!comando_AT("AT+CIPCLOSE", "OK")) {
        basic.showString("E3")
        cadena_serial = ""
        return '-1'
    }

    return recuperar_respuesta(cadena_respuesta)
}


function inicializacion() {
    serial.redirect(SerialPin.P0, SerialPin.P1, 115200) //Se asignan los pines que funcionarán como Receptor(Rx) y Emisor(Tx)
    serial.setRxBufferSize(500)
    serial.setTxBufferSize(500)
    comando_AT("AT+RESTORE", "OK", 5000, true, true) //Recupera configuración de fábrica por defecto
    comando_AT("AT+RST", "OK", 5000, true, true) //Uilizado para reiniciar la función del módulo
}
function configurar_modo() {
    basic.showIcon(IconNames.Pitchfork)
    comando_AT("AT+CWMODE=1", "OK", 5000, true, true) //Asigna modo estación(Station) como dispositivo conectado a una red existente
    comando_AT("AT+CWJAP=\"" + SSID + "\",\"" + PASSWORD + "\"", "WIFI GOT IP", 10000, true, true) //Permite la conexión a una red existente o Access Point(AP)
}

function captacion_gestos() {
    let tacto_identificado: boolean = false

    limpiar_serie_tiempo()
    let respuesta: string = ''
    while (true) {
        basic.showIcon(IconNames.Skull)
        respuesta = solicitar_api("PUT", "/configuracion", "", false, 5000, true)
        if (parseInt(respuesta) > 0) break
    }

    while (true) {
        if (input.buttonIsPressed(Button.A)) {
            respuesta = solicitar_api("DELETE", "/raspberry/ultimo", "", false, 3000)
            if (respuesta == 'o'){
                basic.showIcon(IconNames.Yes)
                pause(1000)
            }
        }
        if (input.buttonIsPressed(Button.B)) {
            respuesta = solicitar_api("PUT", "/reproducir/palabra", "", false, 3000)
            if (respuesta == 'o') {
                basic.showIcon(IconNames.Yes)
                pause(1000)
            }
        }


        if (input.pinIsPressed(TouchPin.P2)) {
            tacto_identificado = true
            serie_tiempo.x.push(input.acceleration(Dimension.X))
            serie_tiempo.y.push(input.acceleration(Dimension.Y))
            serie_tiempo.z.push(input.acceleration(Dimension.Z))
            pause(periodo)
        } else if (tacto_identificado) {
            tacto_identificado = false
            gesto = solicitar_api("POST", "/traducir/gesto", JSON.stringify(serie_tiempo), true, 3000, true) //Se comunica el gesto muestreado
            limpiar_serie_tiempo()
            basic.showString(gesto)
        }
    }
}


function main() {
    inicializacion()
    configurar_modo()
    captacion_gestos()
}
main()