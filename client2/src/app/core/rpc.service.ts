import { EventEmitter, Injectable, Output } from '@angular/core';
import { Http, Response } from "@angular/http";
import { Observable } from "rxjs";
import { ConfigService } from "./config.service";
import { FetchResult } from "./fetch-result";
import { HttpResponse } from "selenium-webdriver/http";
import { RpcError } from "./rpc-error";

/**
 * Support for RPC (REST over HTTP) calls.
 *
 * All calls return an Observable with the JSON response. In case of an error,
 * the Observable throws an RpcError.
 */
@Injectable()
export class RpcService {

  constructor(private config: ConfigService, private http: Http) {
  }

  /**
   * Returns the JSON object contained in the response.
   */
  private getJson(response: Response) {
    const body = response.json() || {};
    return body.data || body;
  }

  /**
   * Combines the search criteria with the pagination parameters.
   */
  private createSearchParams(
      criteria: object, offset?: number, limit?: number, returnCount?: number) {
    const params: any = Object.assign({}, criteria);
    if (limit) {
      params.offset = offset;
      params.limit = limit;
    }
    if (returnCount) {
      params.returnCount = returnCount;
    }
    return params;
  }

  /**
   * Handles the HTTP response containing the JSON payload.
   */
  private handleHttpResult(observable: Observable<HttpResponse>): Observable<Object> {
    return observable.map(this.getJson).catch(this.handleError.bind(this));
  }

  /**
   * Sends a GET request to the API server.
   *
   * @param path Path relative to the API path.
   * @param params Query parameters
   * @returns {Observable<Object>} JSON result observable
   */
  httpGet(path: string, params?: object) {
    return this.handleHttpResult(this.http.get(this.config.apiPath(path), {params: params}));
  }

  /**
   * Sends a POST request to the API server.
   *
   * @param path Path relative to the API path.
   * @param body POST payload
   * @returns {Observable<Object>} JSON result observable
   */
  httpPost(path: string, body?: any) {
    return this.handleHttpResult(this.http.post(this.config.apiPath(path), body));
  }

  /**
   * Fetches entities via HTTP GET.
   *
   * @param path Path of the entities relative to the API path, e.g., '/items'.
   * @param criteria Object representing the query.
   * @param offset Zero-based offset of the objects to return.
   * @param limit Maximal number of objects to return.
   * @param returnCount If true, the total number of objects will be returned.
   * @returns {Observable<Object>} JSON result observable
   */
  fetch(path: string, criteria: object, offset?: number, limit?: number, returnCount?: number):
      Observable<FetchResult> {
    return this.httpGet(path, this.createSearchParams(criteria, offset, limit, returnCount));
  }

  /**
   * Handles an HTTP error response.
   */
  private handleError(response: Response) {
    console.log("error response: ", response);
    //this.error.emit({message: errMsg});
    return Observable.throw(this.toRpcError(response));
  }

  private toRpcError(response: Response) {
    const error = response.json();
    return new RpcError(response.status, error.code);
  }
}
