-- Dumps every row the three flows can touch, without generated ids / timestamps.
--   docker exec -i supabase_db_digital-rescue psql -U postgres -At < dump.sql > out.json
SELECT jsonb_pretty(jsonb_build_object(
  'ticket_materials', (SELECT jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at' ORDER BY m.id) FROM ticket_materials m),
  'specs', (SELECT jsonb_agg(c.name || ' / ' || s.name ORDER BY c.name, s.name)
              FROM inventory_specs s JOIN inventory_categories c ON c.id = s.category_id),
  'products', (SELECT jsonb_agg(c.name || ' / ' || s.name || ' / ' || p.name ORDER BY c.name, s.name, p.name)
                 FROM inventory_products p JOIN inventory_specs s ON s.id = p.spec_id JOIN inventory_categories c ON c.id = s.category_id),
  'items', (SELECT jsonb_agg(jsonb_build_object('item', c.name || ' / ' || s.name || ' / ' || p.name, 'capacity', i.capacity,
                     'condition', i.condition, 'quantity', i.quantity, 'base_estimate', i.base_estimate)
                   ORDER BY c.name, s.name, p.name, i.condition, i.capacity NULLS FIRST)
              FROM inventory_items i JOIN inventory_categories c ON c.id = i.category_id
              JOIN inventory_specs s ON s.id = i.spec_id JOIN inventory_products p ON p.id = i.product_id),
  'transactions', (SELECT jsonb_agg(x ORDER BY x->>'item', x->>'capacity' NULLS FIRST, x->>'type', x->>'notes', x->>'ticket_id' NULLS FIRST, x->>'user_id', x->>'qty')
                     FROM (SELECT jsonb_build_object('item', c.name || ' / ' || s.name || ' / ' || p.name, 'capacity', i.capacity,
                                    'condition', i.condition, 'type', t.transaction_type, 'qty', t.quantity_changed,
                                    'user_id', t.user_id, 'ticket_id', t.ticket_id, 'notes', t.notes) AS x
                             FROM inventory_transactions t JOIN inventory_items i ON i.id = t.item_id
                             JOIN inventory_categories c ON c.id = i.category_id
                             JOIN inventory_specs s ON s.id = i.spec_id JOIN inventory_products p ON p.id = i.product_id) q),
  'ticket_logs', (SELECT jsonb_agg(jsonb_build_object('ticket_id', l.ticket_id, 'employee_id', l.employee_id, 'message', l.message)
                                   ORDER BY l.ticket_id, l.message, l.employee_id) FROM ticket_logs l),
  'material_cost', (SELECT jsonb_object_agg(t.id, t.material_cost ORDER BY t.id) FROM repair_tickets t)
));
