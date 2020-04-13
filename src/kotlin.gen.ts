/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 Looker Data Sciences, Inc.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// Kotlin code generator

import {
  Arg,
  IMappedType,
  IMethod,
  IParameter,
  IProperty,
  IType,
  IntrinsicType,
  ArrayType,
  HashType,
  strBody, DelimArrayType,
} from './sdkModels'
import { CodeGen } from './codeGen'
import { commentBlock} from './utils'

export class KotlinGen extends CodeGen {
  codePath = './kotlin/src/main/com/'
  packagePath = 'looker'
  itself = 'this'
  fileExtension = '.kt'
  commentStr = '// '
  nullStr = 'null'
  transport = 'transport'

  argDelimiter = ', '
  paramDelimiter = ',\n'
  propDelimiter = ',\n'

  indentStr = '  '
  endTypeStr = '\n) : Serializable'
  needsRequestTypes = false
  willItStream = true

  private readonly defaultApi = '4.0'

  isDefaultApi() {
    return this.apiVersion === this.defaultApi
  }

  // TODO create `defaultPackageName` property in CodeGen
  sdkClassName() {
    return this.isDefaultApi() ? 'LookerSDK' : `Looker${this.apiRef}SDK`
  }

  /**
   * Return either api versioned namespace text or empty string if current API is the default
   * @returns {string} 'api31' or '', for example
   */
  apiNamespace() {
    if (this.apiVersion === this.defaultApi) return ''
    return `.api${this.apiRef}`
  }

  // @ts-ignore
  methodsPrologue(indent: string) {
    return `
// ${this.warnEditing()}
package com.looker.sdk${this.apiNamespace()}

import com.looker.rtl.*
import java.util.*

class ${this.sdkClassName()}(authSession: AuthSession) : APIMethods(authSession) {

  val stream by lazy { ${this.sdkClassName()}Stream(this.authSession) }
`
  }

  // @ts-ignore
  streamsPrologue(indent: string): string {
    return `
// ${this.warnEditing()}
package com.looker.sdk${this.apiNamespace()}

import com.looker.rtl.*
import java.util.*

class ${this.sdkClassName()}Stream(authSession: AuthSession) : APIMethods(authSession) {

`
  }

  // @ts-ignore
  methodsEpilogue(indent: string) {
    return '\n}'
  }

  // @ts-ignore
  modelsPrologue(indent: string) {
    return `
// ${this.warnEditing()}

package com.looker.sdk${this.apiNamespace()}

import com.looker.rtl.UriString
import java.io.Serializable
import java.util.*
`
  }

  // @ts-ignore
  modelsEpilogue(indent: string) {
    return ''
  }

  commentHeader(indent: string, text: string | undefined) {
    return text ? `${indent}/**\n${commentBlock(text, indent, ' * ')}\n${indent} */\n` : ''
  }

  declareProperty(indent: string, property: IProperty) {
    const optional = !property.required ? '? = null' : ''
    const type = this.typeMap(property.type)
    return this.commentHeader(indent, this.describeProperty(property))
      + `${indent}var ${property.name}: ${type.name}${optional}`
  }

  paramComment(param: IParameter, mapped: IMappedType) {
    return `@param {${mapped.name}} ${param.name} ${param.description}`
  }

  declareParameter(indent: string, param: IParameter) {
    let type = (param.location === strBody)
      ? this.writeableType(param.type) || param.type
      : param.type
    const mapped = this.typeMap(type)
    let pOpt = ''
    if (!param.required) {
      pOpt = '?'
    }
    return this.commentHeader(indent, this.paramComment(param, mapped))
      + `${indent}${param.name}: ${mapped.name}${pOpt}`
      + (param.required ? '' : (mapped.default ? ` = ${mapped.default}` : ''))
  }

  // @ts-ignore
  initArg(indent: string, property: IProperty) {
    return ''
  }

  // @ts-ignore
  construct(indent: string, type: IType) {
    return ''
  }

  methodHeaderDeclaration(indent: string, method: IMethod, streamer: boolean = false) {
    const type = this.typeMap(method.type)
    const resultType = streamer ? 'ByteArray' : type.name
    const head = method.description?.trim()
    let headComment = (head ? `${head}\n\n` : '')  +`${method.httpMethod} ${method.endpoint} -> ${resultType}`
    let fragment = ''
    const requestType = this.requestTypeName(method)
    const bump = indent + this.indentStr

    if (requestType) {
      // TODO remove this Typescript cruft
      fragment = `request: Partial<${requestType}>`
    } else {
      let params: string[] = []
      const args = method.allParams // get the params in signature order
      if (args && args.length > 0) args.forEach(p => params.push(this.declareParameter(bump, p)))
      fragment = params.length > 0 ? `\n${params.join(this.paramDelimiter)}` : ''
    }
    if (method.responseIsBoth()) {
      headComment += `\n\n**Note**: Binary content may be returned by this method.`
    } else if (method.responseIsBinary()) {
      headComment += `\n\n**Note**: Binary content is returned by this method.\n`
    }
    const jvmOverloads = method.optionalParams.length > 0 ? '@JvmOverloads ' : ''
    // const callback = `callback: (readable: Readable) => Promise<${type.name}>,`
    const header = this.commentHeader(indent, headComment)
      + `${indent}${jvmOverloads}fun ${method.name}(`
      // + (streamer ? `\n${bump}${callback}` : '')

    return header + fragment + `) : SDKResponse {\n`
  }

  methodSignature(indent: string, method: IMethod) {
    return this.methodHeaderDeclaration(indent, method, false)
  }

  encodePathParams(indent: string, method: IMethod) {
    const bump = indent + this.indentStr
    let encodings: string = ''
    if (method.pathParams.length > 0) {
      for (const param of method.pathParams) {
        encodings += `${bump}val path_${param.name} = encodeParam(${param.name})\n`
      }
    }
    return encodings
  }

  declareMethod(indent: string, method: IMethod) {
    const bump = this.bumper(indent)
    return this.methodSignature(indent, method)
      + this.encodePathParams(bump, method)
      + this.httpCall(bump, method)
      + `\n${indent}}`
  }

  streamerSignature(indent: string, method: IMethod) {
    return this.methodHeaderDeclaration(indent, method, true)
  }

  declareStreamer(indent: string, method: IMethod) {
    const bump = this.bumper(indent)
    return this.streamerSignature(indent, method)
      + this.encodePathParams(bump, method)
      + this.streamCall(bump, method)
      + `\n${indent}}`
  }

  typeSignature(indent: string, type: IType) {
    return this.commentHeader(indent, type.description) +
      `${indent}data class ${type.name} (\n`
  }

  // @ts-ignore
  errorResponses(indent: string, method: IMethod) {
    return ""
    // const results: string[] = method.errorResponses
    //   .map(r => `I${r.type.name}`)
    // return results.join(' | ')
  }

  httpPath(path: string, prefix?: string) {
    prefix = prefix || ''
    if (path.indexOf('{') >= 0) return '"' + path.replace(/{/gi, '${path_' + prefix) + '"'
    return `"${path}"`
  }

  // @ts-ignore
  argGroup(indent: string, args: Arg[], prefix?: string) {
    if ((!args) || args.length === 0) return 'mapOf()'
    let hash: string[] = []
    for (let arg of args) {
      if (prefix) {
        hash.push(`"${arg}" to ${prefix}${arg}`)
      } else {
        hash.push(`"${arg}" to ${arg}`)
      }
    }
    let bump = this.bumper(indent)
    let argBump = this.bumper(bump)
    const argWrapper = `,\n ${argBump}`
    return `\n${bump}mapOf(${hash.join(argWrapper)})`
  }

  // @ts-ignore
  argList(indent: string, args: Arg[], prefix?: string) {
    prefix = prefix || ''
    return args && args.length !== 0
      ? `\n${indent}${prefix}${args.join(this.argDelimiter + prefix)}`
      : this.nullStr
  }

  // this is a builder function to produce arguments with optional null place holders but no extra required optional arguments
  argFill(current: string, args: string) {
    if ((!current) && args.trim() === this.nullStr) {
      // Don't append trailing optional arguments if none have been set yet
      return ''
    }
    return `${args}${current ? this.argDelimiter : ''}${current}`
  }

  // build the http argument list from back to front, so trailing undefined arguments
  // can be omitted. Path arguments are resolved as part of the path parameter to general
  // purpose API method call
  // e.g.
  //   {queryArgs...}, bodyArg, {headerArgs...}, {cookieArgs...}
  //   {queryArgs...}, null, null, {cookieArgs...}
  //   null, bodyArg
  //   {queryArgs...}
  httpArgs(indent: string, method: IMethod) {
    const request = this.useRequest(method) ? 'request.' : ''
    // add options at the end of the request calls. this will cause all other arguments to be
    // filled in but there's no way to avoid this for passing in the last optional parameter.
    // Fortunately, this code bloat is minimal and also hidden from the consumer.
    // let result = this.argFill('', 'options')
    // let result = this.argFill('', this.argGroup(indent, method.cookieArgs, request))
    // result = this.argFill(result, this.argGroup(indent, method.headerArgs, request))
    let result = this.argFill('', method.bodyArg ? `${request}${method.bodyArg}` : this.nullStr)
    result = this.argFill(result, this.argGroup(indent, method.queryArgs, request))
    return result
  }

  httpCall(indent: string, method: IMethod) {
    const request = this.useRequest(method) ? 'request.' : ''
    const type = this.typeMap(method.type)
    const bump = indent + this.indentStr
    const args = this.httpArgs(bump, method)
    // TODO don't currently need these for Kotlin
    // const errors = this.errorResponses(indent, method)
    return `${bump}return ${this.it(method.httpMethod.toLowerCase())}<${type.name}>(${this.httpPath(method.endpoint, request)}${args ? ', ' + args : ''})`
  }

  streamCall(indent: string, method: IMethod) {
    const request = this.useRequest(method) ? 'request.' : ''
    // const type = this.typeMap(method.type)
    const bump = indent + this.indentStr
    const args = this.httpArgs(bump, method)
    // const errors = this.errorResponses(indent, method)
    return `${bump}return ${this.it(method.httpMethod.toLowerCase())}<ByteArray>(${this.httpPath(method.endpoint, request)}${args ? ', ' + args : ''})`
  }

  summary(indent: string, text: string | undefined) {
    return this.commentHeader(indent, text)
  }

  typeNames(countError: boolean = true) {
    let names: string[] = []
    if (!this.api) return names
    if (countError) {
      this.api.types['Error'].refCount++
    } else {
      this.api.types['Error'].refCount = 0
    }
    const types = this.api.sortedTypes()
    Object.values(types)
      .filter(type => (type.refCount > 0) && !(type instanceof IntrinsicType))
      .forEach(type => names.push(`I${type.name}`))
    // TODO import default constants if necessary
    // Object.values(types)
    //   .filter(type => type instanceof RequestType)
    //   .forEach(type => names.push(`${strDefault}${type.name.substring(strRequest.length)}`))
    return names
  }

  typeMap(type: IType): IMappedType {
    super.typeMap(type)
    const mt = this.nullStr
    const ktTypes: Record<string, IMappedType> = {
      'number': {name: 'Double', default: mt},
      'float': {name: 'Float', default: mt},
      'double': {name: 'Double', default: mt},
      'integer': {name: 'Int', default: mt},
      'int32': {name: 'Int', default: mt},
      'int64': {name: 'Long', default: mt},
      'string': {name: 'String', default: mt},
      'password': {name: 'Password', default: mt},
      'byte': {name: 'binary', default: mt},
      'boolean': {name: 'Boolean', default: mt},
      'uri': {name: 'UriString', default: mt},
      'url': {name: 'UrlString', default: mt},
      'datetime': {name: 'Date', default: mt},
      'date': {name: 'Date', default: mt},
      'object': {name: 'Any', default: mt},
      'void': {name: 'Void', default: mt}
    }

    if (type.elementType) {
      // This is a structure with nested types
      const map = this.typeMap(type.elementType)
      if (type instanceof ArrayType) {
        return {name: `Array<${map.name}>`, default: this.nullStr}
      } else if (type instanceof HashType) {
        // TODO figure out this bizarre string template error either in IntelliJ or Typescript
        // return {name: `Map<String,${map.name}>`, default: '{}'}
        if (map.name === 'String') map.name = "Any" // TODO fix messy hash values
        return {name: 'Map<String' + `,${map.name}>`, default: this.nullStr}
      } else if (type instanceof DelimArrayType) {
        return {name: `DelimArray<${map.name}>`, default: this.nullStr}
      }
      throw new Error(`Don't know how to handle: ${JSON.stringify(type)}`)
    }

    if (type.name) {
      return ktTypes[type.name] || {name: `${type.name}`, default: this.nullStr}
    } else {
      throw new Error('Cannot output a nameless type.')
    }
  }

}
