import ast

from girder.api import access
from girder.api.describe import Description
from girder.api.rest import Resource

import psycopg2

# TODO: This will be changed with girder_db_items
def connect_to_gryphon(host="localhost",
                       port="5432",
                       user="username",
                       password="password",
                       dbname="gryphon"):

    try:
        conn = psycopg2.connect("dbname={} user={} host={} password={} port={}".format(dbname,
                                                                                       user,
                                                                                       host,
                                                                                       password,
                                                                                       port))
        return conn
    except:
        print "I am unable to connect to {}".format(dbname)


class View(object):
    def __init__(self, conn):
        self._conn = conn

    def generateQuery(self, filters):
        q = []
        for k in filters.keys():
            _ = []
            for v in ast.literal_eval(filters[k]):
                _.append(""" "{}" = '{}' """.format(k, v))
            q.append("(" + "or".join(_) + ")")
        return "and".join(q)


    def getDistinctValues(self, table, filters={}):
        conn = self._conn
        cur = conn.cursor()
        base_query = 'SELECT DISTINCT "{}" from gryphonstates'.format(table)
        if not filters:
            query = base_query + ";"
        else:
            query = base_query + " where" + self.generateQuery(filters) + ";"
        cur.execute(query)
        field = sorted([i[0] for i in cur.fetchall()])
        if not filters:
            field.insert(0, "All")
        return field

    def filter(self, filters):

        resp = {}
        resp['NAME'] = self.getDistinctValues('NAME', filters)
        resp['PRODUCTION_CATEGORY'] = self.getDistinctValues('PRODUCTION_CATEGORY', filters)
        resp['CATEGORY'] = self.getDistinctValues('CATEGORY', filters)
        resp['SUB_CATEGORY'] = self.getDistinctValues('SUB_CATEGORY', filters)
        resp['DATA_DERIVATION'] = self.getDistinctValues('DATA_DERIVATION', filters)

        return resp

    def getGeojson(self):
        base = """SELECT "geom", "NAME", "PRODUCTION_CATEGORY", "VALUE" from gryphonstates"""
        filters = self.generateQuery()
        query = base + " where " + filters
        cur = self._conn.cursor()
        cur.execute("""SELECT row_to_json(fc)
FROM ( SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features
   FROM (SELECT 'Feature' As type
    , ST_AsGeoJSON(lg."geom")::json As geometry
        , row_to_json((SELECT l FROM (SELECT lg."NAME", lg."VALUE",
        lg."PRODUCTION_CATEGORY", lg."CATEGORY", lg."SUB_CATEGORY", lg."DATA_DERIVATION") As l
      )) As properties
        FROM (%s) As lg ) As f ) As fc;""" % query)

        return cur.fetchall()[0][0]
